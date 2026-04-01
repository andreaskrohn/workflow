'use client'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeDragHandler,
  type EdgeMouseHandler,
} from 'reactflow'
import 'reactflow/dist/style.css'
import dagre from 'dagre'
import type { Task } from '@/lib/db/repositories/taskRepository'
import { getCsrfToken } from '@/lib/middleware/csrf'
import { useToast } from '@/components/shared/ToastProvider'
import { TaskNode, type TaskNodeData } from './TaskNode'
import { EndGoalNode, type EndGoalNodeData } from './EndGoalNode'
import { UndoToast } from './UndoToast'
import { TaskDetailPanel } from './TaskDetailPanel'

// ── Constants ─────────────────────────────────────────────────────────────────

const NODE_WIDTH = 220
const NODE_HEIGHT = 80
const ADD_TASK_RADIUS = 500
const ADD_TASK_OFFSET = 20
const ADD_TASK_MAX_ITER = 50
const UNDO_SNAPSHOT_LIMIT = 100 * 1024 // 100 KB

const nodeTypes = {
  taskNode: TaskNode,
  endGoalNode: EndGoalNode,
}

// ── Dagre layout ──────────────────────────────────────────────────────────────

function applyDagreLayout(
  nodes: Node[],
  edges: Edge[],
): Node[] {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 80 })

  for (const n of nodes) {
    g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  }
  for (const e of edges) {
    g.setEdge(e.source, e.target)
  }

  dagre.layout(g)

  return nodes.map((n) => {
    const pos = g.node(n.id)
    return { ...n, position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 } }
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function taskToNode(task: Task, isEvaluating: boolean): Node<TaskNodeData> {
  return {
    id: task.id,
    type: 'taskNode',
    position: { x: task.position_x ?? 0, y: task.position_y ?? 0 },
    data: {
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      isEvaluating,
    },
  }
}

interface ApiDep {
  id: string
  task_id: string
  depends_on_task_id: string
  archived_at: number | null
}

function depToEdge(dep: ApiDep): Edge {
  return {
    id: dep.id,
    source: dep.task_id,
    target: dep.depends_on_task_id,
  }
}

// ── UndoSnapshot ─────────────────────────────────────────────────────────────

interface UndoSnapshot {
  depId: string
  taskId: string
  dependsOnTaskId: string
  edgesBefore: Edge[]
}

// ── Main component ────────────────────────────────────────────────────────────

interface WorkflowGraphInnerProps {
  tasks: Task[]
  deps: ApiDep[]
  endGoal: string
}

function WorkflowGraphInner({ tasks, deps, endGoal }: WorkflowGraphInnerProps) {
  const { fitView } = useReactFlow()
  const { showToast } = useToast()

  const [isEvaluating, setIsEvaluating] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [taskMap, setTaskMap] = useState<Map<string, Task>>(() =>
    new Map(tasks.map((t) => [t.id, t])),
  )
  const [undoSnapshot, setUndoSnapshot] = useState<UndoSnapshot | null>(null)

  const initialNodes = tasks.map((t) => taskToNode(t, false))
  const initialEdges = deps.filter((d) => d.archived_at == null).map(depToEdge)

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // ── Sync isEvaluating into all node data ───────────────────────────────────

  useEffect(() => {
    setNodes((ns) =>
      ns.map((n) => ({
        ...n,
        data: { ...n.data, isEvaluating },
      })),
    )
  }, [isEvaluating, setNodes])

  // ── Auto-fit on mount ──────────────────────────────────────────────────────

  useEffect(() => {
    setTimeout(() => fitView({ padding: 0.1 }), 50)
  }, [fitView])

  // ── Node drag: save position ───────────────────────────────────────────────

  const onNodeDragStop: NodeDragHandler = useCallback(
    async (_event, node) => {
      try {
        const token = await getCsrfToken()
        await fetch(`/api/tasks/${node.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
          body: JSON.stringify({ position_x: node.position.x, position_y: node.position.y }),
        })
      } catch {
        // position save failure is non-fatal
      }
    },
    [],
  )

  // ── Connect: cycle check → create dependency ──────────────────────────────

  const onConnect = useCallback(
    async (connection: Connection) => {
      if (!connection.source || !connection.target) return
      setIsEvaluating(true)
      try {
        const token = await getCsrfToken()
        const res = await fetch('/api/dependencies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
          body: JSON.stringify({
            task_id: connection.source,
            depends_on_task_id: connection.target,
          }),
        })
        if (res.status === 409) {
          const data = await res.json().catch(() => ({}))
          showToast(data.error ?? 'This dependency would create a cycle.')
          return
        }
        if (!res.ok) {
          showToast('Failed to create dependency.')
          return
        }
        const dep: ApiDep = await res.json()
        setEdges((es) => addEdge({ ...connection, id: dep.id }, es))
      } finally {
        setIsEvaluating(false)
      }
    },
    [setEdges, showToast],
  )

  // ── Edge click: soft-delete with undo ─────────────────────────────────────

  const onEdgeClick: EdgeMouseHandler = useCallback(
    async (_event, edge) => {
      const snapshot = JSON.stringify({ depId: edge.id, edges })
      if (snapshot.length > UNDO_SNAPSHOT_LIMIT) {
        // Snapshot too large — skip undo, just delete
        await doArchiveDep(edge.id)
        setEdges((es) => es.filter((e) => e.id !== edge.id))
        return
      }

      // Conflict check: ensure dep still exists (not already archived)
      const depRes = await fetch(`/api/dependencies/${edge.id}`).catch(() => null)
      if (!depRes || !depRes.ok) {
        setEdges((es) => es.filter((e) => e.id !== edge.id))
        showToast('Dependency was already removed.')
        return
      }

      const dep: ApiDep = await depRes.json()
      if (dep.archived_at != null) {
        setEdges((es) => es.filter((e) => e.id !== edge.id))
        showToast('Dependency was already removed.')
        return
      }

      await doArchiveDep(edge.id)
      setEdges((es) => es.filter((e) => e.id !== edge.id))
      setUndoSnapshot({
        depId: edge.id,
        taskId: dep.task_id,
        dependsOnTaskId: dep.depends_on_task_id,
        edgesBefore: edges,
      })
    },
    [edges, setEdges, showToast],
  )

  async function doArchiveDep(id: string) {
    try {
      const token = await getCsrfToken()
      await fetch(`/api/dependencies/${id}/archive`, {
        method: 'POST',
        headers: { 'X-CSRF-Token': token },
      })
    } catch {
      // non-fatal
    }
  }

  // ── Undo edge deletion ─────────────────────────────────────────────────────

  async function handleUndo() {
    if (!undoSnapshot) return
    setUndoSnapshot(null)
    try {
      const token = await getCsrfToken()
      const res = await fetch('/api/dependencies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
        body: JSON.stringify({
          task_id: undoSnapshot.taskId,
          depends_on_task_id: undoSnapshot.dependsOnTaskId,
        }),
      })
      if (!res.ok) {
        showToast('Could not restore dependency.')
        return
      }
      const dep: ApiDep = await res.json()
      setEdges((es) => [...undoSnapshot.edgesBefore.filter((e) => e.id !== dep.id), depToEdge(dep)])
    } catch {
      showToast('Could not restore dependency.')
    }
  }

  // ── Add Task ───────────────────────────────────────────────────────────────

  async function handleAddTask() {
    // Find a non-overlapping position within 500px radius, offsetting by 20px per attempt
    const existingPositions = nodes.map((n) => n.position)
    let x = 100
    let y = 100

    outer: for (let i = 0; i < ADD_TASK_MAX_ITER; i++) {
      const angle = (i / ADD_TASK_MAX_ITER) * 2 * Math.PI
      const r = ADD_TASK_OFFSET * i
      const cx = 200 + r * Math.cos(angle)
      const cy = 200 + r * Math.sin(angle)

      // Check collision
      let collision = false
      for (const pos of existingPositions) {
        if (Math.abs(pos.x - cx) < NODE_WIDTH && Math.abs(pos.y - cy) < NODE_HEIGHT) {
          collision = true
          break
        }
      }
      if (!collision) {
        x = cx
        y = cy
        break outer
      }
    }

    // Fallback: place at radius 500 from center if all slots collide
    if (x === 100 && y === 100 && existingPositions.length > 0) {
      x = ADD_TASK_RADIUS
      y = ADD_TASK_RADIUS
    }

    try {
      const token = await getCsrfToken()
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
        body: JSON.stringify({ title: 'New task', position_x: x, position_y: y }),
      })
      if (!res.ok) {
        showToast('Failed to create task.')
        return
      }
      const task: Task = await res.json()
      setTaskMap((m) => new Map(m).set(task.id, task))
      setNodes((ns) => [...ns, taskToNode(task, isEvaluating)])
    } catch {
      showToast('Failed to create task.')
    }
  }

  // ── Auto-layout ────────────────────────────────────────────────────────────

  function handleAutoLayout() {
    const laid = applyDagreLayout(nodes, edges)
    setNodes(laid)
    setTimeout(() => fitView({ padding: 0.1 }), 50)
  }

  // ── Node click: open detail panel ─────────────────────────────────────────

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const task = taskMap.get(node.id)
      if (task) setSelectedTask(task)
    },
    [taskMap],
  )

  function handleTaskUpdated(updated: Task) {
    setTaskMap((m) => new Map(m).set(updated.id, updated))
    setNodes((ns) =>
      ns.map((n) =>
        n.id === updated.id
          ? { ...n, data: { ...n.data, title: updated.title, status: updated.status, priority: updated.priority } }
          : n,
      ),
    )
    setSelectedTask(updated)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full w-full">
      <div className="relative flex-1">
        {/* End goal header */}
        {endGoal && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 rounded-lg border border-purple-500 bg-purple-950 px-4 py-2 text-sm text-purple-200 font-medium shadow-lg pointer-events-none max-w-md text-center">
            {isEvaluating ? 'Calculating…' : endGoal}
          </div>
        )}

        {/* Toolbar */}
        <div className="absolute top-3 right-3 z-10 flex gap-2">
          <button
            onClick={handleAddTask}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 shadow"
          >
            + Add Task
          </button>
          <button
            onClick={handleAutoLayout}
            className="rounded bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-600 shadow"
          >
            Auto Layout
          </button>
        </div>

        {/* Undo toast */}
        {undoSnapshot && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
            <UndoToast
              message="Dependency removed."
              onUndo={handleUndo}
              onDismiss={() => setUndoSnapshot(null)}
            />
          </div>
        )}

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDragStop={onNodeDragStop}
          onEdgeClick={onEdgeClick}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.1 }}
          className="bg-slate-950"
        >
          <Background color="#334155" gap={20} />
          <Controls />
          <MiniMap nodeColor="#3b82f6" maskColor="rgba(15,23,42,0.7)" />
        </ReactFlow>
      </div>

      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdated={handleTaskUpdated}
        />
      )}
    </div>
  )
}

// ── Public wrapper (fetches data) ──────────────────────────────────────────────

export function WorkflowGraph() {
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [deps, setDeps] = useState<ApiDep[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/tasks').then((r) => r.json()),
      fetch('/api/dependencies').then((r) => r.json()),
    ])
      .then(([t, d]) => {
        setTasks(t)
        setDeps(d)
      })
      .catch(() => setError('Failed to load graph data.'))
  }, [])

  // Derive end goal from the first task that has one set
  const endGoal = tasks?.find((t) => t.end_goal)?.end_goal ?? ''

  if (error) return <p className="text-red-400 p-6">{error}</p>
  if (!tasks || !deps) return <p className="text-slate-400 p-6">Loading…</p>

  return (
    <ReactFlowProvider>
      <WorkflowGraphInner tasks={tasks} deps={deps} endGoal={endGoal} />
    </ReactFlowProvider>
  )
}
