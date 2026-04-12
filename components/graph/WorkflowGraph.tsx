'use client'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import type { Workflow } from '@/lib/db/repositories/workflowRepository'
import { getCsrfToken } from '@/lib/middleware/csrf'
import { mutate } from '@/lib/utils/mutate'
import { useToast } from '@/components/shared/ToastProvider'
import { TaskNode, type TaskNodeData } from './TaskNode'
import { EndGoalNode, type EndGoalNodeData } from './EndGoalNode'
import { WorkflowHeaderNode, type WorkflowHeaderNodeData, WORKFLOW_HEADER_NODE_WIDTH } from './WorkflowHeaderNode'
import { UndoToast } from './UndoToast'
import { TaskDetailPanel } from './TaskDetailPanel'
import { WorkflowDetailPanel } from './WorkflowDetailPanel'
import { computeEnabledTasks } from '@/lib/graph/computeTaskStates'
import type { TaskEnabledState } from '@/lib/graph/evaluateWorkflowStates'

// ── Constants ─────────────────────────────────────────────────────────────────

const NODE_WIDTH = 220
const NODE_HEIGHT = 80
const WORKFLOW_HEADER_HEIGHT = 52
const WORKFLOW_CONTENT_HEIGHT = 380
const WORKFLOW_GAP = 120
const UNDO_SNAPSHOT_LIMIT = 100 * 1024

const nodeTypes = {
  taskNode: TaskNode,
  endGoalNode: EndGoalNode,
  workflowHeader: WorkflowHeaderNode,
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ApiDep {
  id: string
  task_id: string
  depends_on_task_id: string
  archived_at: number | null
}

interface WorkflowWithData {
  workflow: Workflow
  tasks: Task[]
  deps: ApiDep[]
}

type UndoSnapshot =
  | {
      type: 'dep'
      depId: string
      taskId: string
      dependsOnTaskId: string
      workflowId: string
    }
  | {
      type: 'task'
      taskId: string
      workflowId: string
      taskNode: Node
      task: Task
      removedDeps: Array<{ taskId: string; dependsOnTaskId: string }>
    }

// ── Helpers ───────────────────────────────────────────────────────────────────

function applyDagreLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', nodesep: 80, ranksep: 150 })
  for (const n of nodes) g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  for (const e of edges) g.setEdge(e.source, e.target)
  dagre.layout(g)
  return nodes.map((n) => {
    const pos = g.node(n.id)
    return { ...n, position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 } }
  })
}

function depToEdge(dep: ApiDep): Edge {
  return { id: dep.id, source: dep.depends_on_task_id, target: dep.task_id }
}

function edgesToActiveDeps(realEdges: Edge[]): ApiDep[] {
  return realEdges.map((e) => ({
    id: e.id,
    task_id: e.target,
    depends_on_task_id: e.source,
    archived_at: null,
  }))
}

function findTerminalIds(tasks: Task[], activeDeps: ApiDep[]): string[] {
  const isPrereq = new Set(activeDeps.map((d) => d.depends_on_task_id))
  return tasks.map((t) => t.id).filter((id) => !isPrereq.has(id))
}

function computeWorkflowOffsets(
  wfData: WorkflowWithData[],
  heights: Map<string, number>,
): number[] {
  const offsets: number[] = []
  let y = 0
  for (const { workflow } of wfData) {
    offsets.push(y)
    const h = heights.get(workflow.id) ?? WORKFLOW_CONTENT_HEIGHT
    y += WORKFLOW_HEADER_HEIGHT + h + WORKFLOW_GAP
  }
  return offsets
}

function relativeToAbsolute(relY: number, bandOffset: number): number {
  return bandOffset + WORKFLOW_HEADER_HEIGHT + relY
}

function absoluteToRelative(absY: number, bandOffset: number): number {
  return absY - bandOffset - WORKFLOW_HEADER_HEIGHT
}

function endGoalNodeId(workflowId: string): string {
  return `__eg__${workflowId}`
}

function headerNodeId(workflowId: string): string {
  return `__header__${workflowId}`
}

function syntheticEdgeId(taskId: string, workflowId: string): string {
  return `__seg__${taskId}_${workflowId}`
}

function isRealEdge(e: Edge): boolean {
  return !e.id.startsWith('__seg__')
}

function isEgPinnedEdge(e: Edge): boolean {
  return e.id.startsWith('__eg_pin__')
}

function isTaskDepEdge(e: Edge): boolean {
  return isRealEdge(e) && !isEgPinnedEdge(e)
}

function pinnedEgEdgeId(taskId: string, workflowId: string): string {
  return `__eg_pin__${taskId}_${workflowId}`
}

function findFreePosition(
  preferredX: number,
  preferredY: number,
  existingPositions: { x: number; y: number }[],
): { x: number; y: number } {
  const MARGIN = 20
  function overlaps(x: number, y: number): boolean {
    return existingPositions.some(
      (p) => Math.abs(p.x - x) < NODE_WIDTH + MARGIN && Math.abs(p.y - y) < NODE_HEIGHT + MARGIN,
    )
  }
  if (!overlaps(preferredX, preferredY)) return { x: preferredX, y: preferredY }
  for (let step = 1; step <= 8; step++) {
    const down = preferredY + step * (NODE_HEIGHT + MARGIN)
    if (!overlaps(preferredX, down)) return { x: preferredX, y: down }
    const up = preferredY - step * (NODE_HEIGHT + MARGIN)
    if (!overlaps(preferredX, up)) return { x: preferredX, y: up }
  }
  const maxY = existingPositions.length > 0 ? Math.max(...existingPositions.map((p) => p.y)) : preferredY
  return { x: preferredX, y: maxY + NODE_HEIGHT + MARGIN }
}

function buildSynthEdges(
  wfTasks: Task[],
  wfRealEdges: Edge[],
  workflowId: string,
  endGoal: string | null,
): Edge[] {
  if (!endGoal) return []
  const activeDeps = edgesToActiveDeps(wfRealEdges)
  const terminalIds = findTerminalIds(wfTasks, activeDeps)
  return terminalIds.map((tid) => ({
    id: syntheticEdgeId(tid, workflowId),
    source: tid,
    target: endGoalNodeId(workflowId),
    style: { strokeDasharray: '4 4', stroke: '#7c3aed' },
    zIndex: -1,
    selectable: false,
    deletable: false,
  }))
}

function buildWorkflowGraph(
  wData: WorkflowWithData,
  bandOffset: number,
  contentHeight: number,
  stableToggle: TaskNodeData['onToggle'],
  stableAddConnected: TaskNodeData['onAddConnected'],
  stableAddBefore: TaskNodeData['onAddBefore'],
  stableAddTask: WorkflowHeaderNodeData['onAddTask'],
  stableSaveEndGoal: WorkflowHeaderNodeData['onSaveEndGoal'],
  stableSaveName: WorkflowHeaderNodeData['onSaveName'],
  stableOpenDetail: WorkflowHeaderNodeData['onOpenDetail'],
  stableArchive: WorkflowHeaderNodeData['onArchive'],
  stableDelete: WorkflowHeaderNodeData['onDelete'],
  stableOpenEndGoalDetail: (workflowId: string) => void,
  stableAddTaskBeforeEndGoal: (workflowId: string) => void,
): { nodes: Node[]; edges: Edge[] } {
  const { workflow, tasks, deps } = wData
  const activeDeps = deps.filter((d) => d.archived_at == null)
  const enabledIds = computeEnabledTasks(tasks, activeDeps)
  const hasPositions = tasks.some((t) => t.position_x != null)
  const realEdges = activeDeps.map(depToEdge)

  const headerNode: Node = {
    id: headerNodeId(workflow.id),
    type: 'workflowHeader',
    position: { x: -300, y: bandOffset },
    draggable: false,
    selectable: false,
    deletable: false,
    data: {
      workflowId: workflow.id,
      name: workflow.name,
      endGoal: workflow.end_goal,
      endGoalDueDate: workflow.due_date ?? null,
      onSaveEndGoal: stableSaveEndGoal,
      onSaveName: stableSaveName,
      onAddTask: stableAddTask,
      onOpenDetail: stableOpenDetail,
      onArchive: stableArchive,
      onDelete: stableDelete,
    } as WorkflowHeaderNodeData,
    style: { width: WORKFLOW_HEADER_NODE_WIDTH },
  }

  let taskNodes: Node[] = tasks.map((t) => ({
    id: t.id,
    type: 'taskNode',
    position: hasPositions
      ? { x: t.position_x!, y: relativeToAbsolute(t.position_y!, bandOffset) }
      : { x: 0, y: 0 },
    data: {
      id: t.id,
      title: t.title,
      description: t.description ?? null,
      status: t.status,
      priority: t.priority,
      due_date: t.due_date ?? null,
      defer_date: t.defer_date ?? null,
      isEvaluating: false,
      isEnabled: enabledIds.has(t.id),
      onToggle: stableToggle,
      onAddConnected: stableAddConnected,
      onAddBefore: stableAddBefore,
    } as TaskNodeData,
  }))

  if (!hasPositions && taskNodes.length > 0) {
    taskNodes = applyDagreLayout(taskNodes, realEdges).map((n) => ({
      ...n,
      position: { x: n.position.x, y: n.position.y + bandOffset + WORKFLOW_HEADER_HEIGHT },
    }))
  }

  // End goal node — use saved position if available, otherwise compute
  const egId = endGoalNodeId(workflow.id)
  const endGoalNodes: Node[] = []
  if (workflow.end_goal) {
    const positions = taskNodes.map((n) => n.position)
    const maxX = positions.length > 0 ? Math.max(...positions.map((p) => p.x)) + NODE_WIDTH + 200 : 600
    const midY =
      positions.length > 0
        ? positions.reduce((s, p) => s + p.y, 0) / positions.length
        : bandOffset + WORKFLOW_HEADER_HEIGHT + contentHeight / 2

    const egX = workflow.eg_position_x != null ? workflow.eg_position_x : maxX
    const egAbsY = workflow.eg_position_y != null
      ? relativeToAbsolute(workflow.eg_position_y, bandOffset)
      : midY - 40

    endGoalNodes.push({
      id: egId,
      type: 'endGoalNode',
      position: { x: egX, y: egAbsY },
      draggable: true,
      deletable: false,
      zIndex: -1,
      data: {
        endGoal: workflow.end_goal,
        dueDate: workflow.due_date ?? null,
        onAddTask: () => stableAddTaskBeforeEndGoal(workflow.id),
        onOpenDetail: () => stableOpenEndGoalDetail(workflow.id),
      } as EndGoalNodeData,
    })
  }

  const synthEdges = buildSynthEdges(tasks, realEdges, workflow.id, workflow.end_goal)

  return {
    nodes: [headerNode, ...taskNodes, ...endGoalNodes],
    edges: [...realEdges, ...synthEdges],
  }
}

// ── Inner component ───────────────────────────────────────────────────────────

interface InnerProps {
  projectId: string
  initialWorkflowsData: WorkflowWithData[]
}

function WorkflowGraphInner({ projectId, initialWorkflowsData }: InnerProps) {
  const { fitView } = useReactFlow()
  const { showToast } = useToast()

  const [workflowsData, setWorkflowsData] = useState(initialWorkflowsData)
  const workflowsDataRef = useRef(initialWorkflowsData)
  useEffect(() => { workflowsDataRef.current = workflowsData }, [workflowsData])

  const workflowHeightsRef = useRef<Map<string, number>>(new Map())

  const taskMapRef = useRef<Map<string, Task>>(new Map())
  const taskToWorkflowRef = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    initialWorkflowsData.forEach(({ workflow, tasks }) => {
      tasks.forEach((t) => {
        taskMapRef.current.set(t.id, t)
        taskToWorkflowRef.current.set(t.id, workflow.id)
      })
      let maxRelY = 0
      tasks.forEach((t) => {
        if (t.position_y != null) maxRelY = Math.max(maxRelY, t.position_y + NODE_HEIGHT)
      })
      const h = Math.max(WORKFLOW_CONTENT_HEIGHT, maxRelY + 40)
      if (h > WORKFLOW_CONTENT_HEIGHT) workflowHeightsRef.current.set(workflow.id, h)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const csrfCacheRef = useRef<string | null>(null)
  const nodesRef = useRef<Node[]>([])
  const deletingTaskIdsRef = useRef<Set<string>>(new Set())

  // Forward-declare stable callbacks
  const toggleRef = useRef<TaskNodeData['onToggle']>(() => {})
  const addConnectedRef = useRef<TaskNodeData['onAddConnected']>(() => {})
  const addBeforeRef = useRef<TaskNodeData['onAddBefore']>(() => {})
  const addTaskRef = useRef<WorkflowHeaderNodeData['onAddTask']>(() => {})
  const saveEndGoalRef = useRef<WorkflowHeaderNodeData['onSaveEndGoal']>(() => {})
  const saveNameRef = useRef<WorkflowHeaderNodeData['onSaveName']>(() => {})
  const openDetailRef = useRef<WorkflowHeaderNodeData['onOpenDetail']>(() => {})
  const archiveRef = useRef<WorkflowHeaderNodeData['onArchive']>(() => {})
  const deleteRef = useRef<WorkflowHeaderNodeData['onDelete']>(() => {})
  const openEndGoalDetailRef = useRef<(workflowId: string) => void>(() => {})
  const addTaskBeforeEndGoalRef = useRef<(workflowId: string) => void>(() => {})

  const stableToggle = useCallback<TaskNodeData['onToggle']>((id, s) => toggleRef.current(id, s), [])
  const stableAddConnected = useCallback<TaskNodeData['onAddConnected']>((id) => addConnectedRef.current(id), [])
  const stableAddBefore = useCallback<TaskNodeData['onAddBefore']>((id) => addBeforeRef.current(id), [])
  const stableAddTask = useCallback<WorkflowHeaderNodeData['onAddTask']>((wid) => addTaskRef.current(wid), [])
  const stableSaveEndGoal = useCallback<WorkflowHeaderNodeData['onSaveEndGoal']>((wid, eg) => saveEndGoalRef.current(wid, eg), [])
  const stableSaveName = useCallback<WorkflowHeaderNodeData['onSaveName']>((wid, n) => saveNameRef.current(wid, n), [])
  const stableOpenDetail = useCallback<WorkflowHeaderNodeData['onOpenDetail']>((wid) => openDetailRef.current(wid), [])
  const stableArchive = useCallback<WorkflowHeaderNodeData['onArchive']>((wid) => archiveRef.current(wid), [])
  const stableDelete = useCallback<WorkflowHeaderNodeData['onDelete']>((wid) => deleteRef.current(wid), [])
  const stableOpenEndGoalDetail = useCallback((wid: string) => openEndGoalDetailRef.current(wid), [])
  const stableAddTaskBeforeEndGoal = useCallback((wid: string) => addTaskBeforeEndGoalRef.current(wid), [])

  const { initNodes, initEdges } = useMemo(() => {
    const offsets = computeWorkflowOffsets(initialWorkflowsData, workflowHeightsRef.current)
    let allNodes: Node[] = []
    let allEdges: Edge[] = []
    initialWorkflowsData.forEach((wData, i) => {
      const h = workflowHeightsRef.current.get(wData.workflow.id) ?? WORKFLOW_CONTENT_HEIGHT
      const { nodes, edges } = buildWorkflowGraph(
        wData, offsets[i], h,
        stableToggle, stableAddConnected, stableAddBefore,
        stableAddTask, stableSaveEndGoal, stableSaveName,
        stableOpenDetail, stableArchive, stableDelete,
        stableOpenEndGoalDetail, stableAddTaskBeforeEndGoal,
      )
      allNodes = [...allNodes, ...nodes]
      allEdges = [...allEdges, ...edges]
    })
    return { initNodes: allNodes, initEdges: allEdges }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [selectedWorkflowDetail, setSelectedWorkflowDetail] = useState<Workflow | null>(null)
  const [undoSnapshot, setUndoSnapshot] = useState<UndoSnapshot | null>(null)
  const [isEvaluating, setIsEvaluating] = useState(false)
  const [showCreateWorkflow, setShowCreateWorkflow] = useState(false)
  const [newWfName, setNewWfName] = useState('')
  const [newWfEndGoal, setNewWfEndGoal] = useState('')
  const [creatingWf, setCreatingWf] = useState(false)
  const [completionDialog, setCompletionDialog] = useState<string | null>(null)
  // Archive/delete confirmation: mode distinguishes confirm text
  const [workflowActionDialog, setWorkflowActionDialog] = useState<{
    workflowId: string
    mode: 'archive' | 'delete'
  } | null>(null)

  useEffect(() => { nodesRef.current = nodes }, [nodes])

  useEffect(() => {
    getCsrfToken().then((t) => { csrfCacheRef.current = t })
  }, [])

  // Persist task positions on unmount
  useEffect(() => {
    return () => {
      const token = csrfCacheRef.current
      if (!token) return
      const offsets = computeWorkflowOffsets(workflowsDataRef.current, workflowHeightsRef.current)
      const positions = nodesRef.current
        .filter((n) => n.type === 'taskNode')
        .map((n) => {
          const wfId = taskToWorkflowRef.current.get(n.id)
          const wfIdx = workflowsDataRef.current.findIndex((w) => w.workflow.id === wfId)
          const offset = offsets[wfIdx >= 0 ? wfIdx : 0] ?? 0
          return { id: n.id, position_x: n.position.x, position_y: absoluteToRelative(n.position.y, offset) }
        })
      if (positions.length === 0) return
      fetch('/api/tasks/positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
        body: JSON.stringify({ positions }),
        keepalive: true,
      }).catch(() => {})
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setNodes((ns) =>
      ns.map((n) => n.type === 'taskNode' ? { ...n, data: { ...n.data, isEvaluating } } : n),
    )
  }, [isEvaluating, setNodes])

  useEffect(() => {
    setTimeout(() => fitView({ padding: 0.1 }), 80)
  }, [fitView])

  // ── Helpers ───────────────────────────────────────────────────────────────

  async function getToken(): Promise<string> {
    const t = await getCsrfToken()
    csrfCacheRef.current = t
    return t
  }

  function rebuildAllSynthEdges(realEdges: Edge[]): Edge[] {
    const synth: Edge[] = []
    for (const wData of workflowsDataRef.current) {
      const { workflow, tasks } = wData
      // Only task-dep edges count for terminal detection (not pinned eg edges)
      const wfTaskDepEdges = realEdges.filter(
        (e) => isTaskDepEdge(e) && taskToWorkflowRef.current.get(e.source) === workflow.id,
      )
      synth.push(...buildSynthEdges(tasks, wfTaskDepEdges, workflow.id, workflow.end_goal))
    }
    return synth
  }

  async function fetchAndApplyTaskStates(workflowId: string) {
    const res = await fetch(`/api/workflows/${workflowId}/task-states`).catch(() => null)
    if (!res?.ok) return
    const states: TaskEnabledState[] = await res.json()
    const stateMap = new Map(states.map((s) => [s.id, s.enabled]))
    setNodes((ns) =>
      ns.map((n) => {
        if (n.type !== 'taskNode') return n
        if (taskToWorkflowRef.current.get(n.id) !== workflowId) return n
        const enabled = stateMap.get(n.id)
        if (enabled === undefined) return n
        return { ...n, data: { ...n.data, isEnabled: enabled } }
      }),
    )
  }

  function getWorkflowOffset(workflowId: string): number {
    const offsets = computeWorkflowOffsets(workflowsDataRef.current, workflowHeightsRef.current)
    const idx = workflowsDataRef.current.findIndex((w) => w.workflow.id === workflowId)
    return offsets[idx >= 0 ? idx : 0] ?? 0
  }

  function ensureWorkflowHeight(workflowId: string, neededRelY: number) {
    const neededH = neededRelY + NODE_HEIGHT + 40
    const currentH = workflowHeightsRef.current.get(workflowId) ?? WORKFLOW_CONTENT_HEIGHT
    if (neededH <= currentH) return
    const delta = neededH - currentH
    workflowHeightsRef.current.set(workflowId, neededH)
    const wfIdx = workflowsDataRef.current.findIndex((w) => w.workflow.id === workflowId)
    if (wfIdx >= 0) shiftWorkflowsBelow(wfIdx + 1, delta)
  }

  function patchEndGoalNode(workflowId: string, updated: Workflow) {
    const egId = endGoalNodeId(workflowId)
    setNodes((ns) => {
      if (!updated.end_goal) return ns.filter((n) => n.id !== egId)
      const hasEg = ns.some((n) => n.id === egId)
      if (hasEg) {
        return ns.map((n) =>
          n.id === egId
            ? { ...n, data: { ...n.data, endGoal: updated.end_goal, dueDate: updated.due_date ?? null } as EndGoalNodeData }
            : n,
        )
      }
      // Create a new end goal node
      const offset = getWorkflowOffset(workflowId)
      const taskPositions = ns
        .filter((n) => n.type === 'taskNode' && taskToWorkflowRef.current.get(n.id) === workflowId)
        .map((n) => n.position)
      const egX = updated.eg_position_x != null ? updated.eg_position_x
        : taskPositions.length > 0 ? Math.max(...taskPositions.map((p) => p.x)) + NODE_WIDTH + 200 : 600
      const egAbsY = updated.eg_position_y != null
        ? relativeToAbsolute(updated.eg_position_y, offset)
        : taskPositions.length > 0
          ? taskPositions.reduce((s, p) => s + p.y, 0) / taskPositions.length - 40
          : offset + WORKFLOW_HEADER_HEIGHT + WORKFLOW_CONTENT_HEIGHT / 2
      return [
        ...ns,
        {
          id: egId, type: 'endGoalNode',
          position: { x: egX, y: egAbsY },
          draggable: true, zIndex: -1,
          data: {
            endGoal: updated.end_goal, dueDate: updated.due_date ?? null,
            onAddTask: () => stableAddTaskBeforeEndGoal(workflowId),
            onOpenDetail: () => stableOpenEndGoalDetail(workflowId),
          } as EndGoalNodeData,
        },
      ]
    })
  }

  function updateWorkflowInState(workflowId: string, updated: Workflow) {
    const newWfsData = workflowsDataRef.current.map((wd) =>
      wd.workflow.id === workflowId ? { ...wd, workflow: updated } : wd,
    )
    workflowsDataRef.current = newWfsData
    setWorkflowsData(newWfsData)
    setNodes((ns) =>
      ns.map((n) =>
        n.id === headerNodeId(workflowId)
          ? { ...n, data: { ...n.data, name: updated.name, endGoal: updated.end_goal, endGoalDueDate: updated.due_date ?? null } }
          : n,
      ),
    )
    patchEndGoalNode(workflowId, updated)
    setEdges((es) => {
      const realEdges = es.filter(isRealEdge)
      return [...realEdges, ...rebuildAllSynthEdges(realEdges)]
    })
    setSelectedWorkflowDetail((prev) => (prev?.id === workflowId ? updated : prev))
  }

  /** Remove all canvas nodes and edges for a workflow. */
  function removeWorkflowFromCanvas(workflowId: string) {
    const newWfsData = workflowsDataRef.current.filter((wd) => wd.workflow.id !== workflowId)
    workflowsDataRef.current = newWfsData
    setWorkflowsData(newWfsData)
    setNodes((ns) =>
      ns.filter((n) => {
        if (n.id === headerNodeId(workflowId)) return false
        if (n.id === endGoalNodeId(workflowId)) return false
        if (taskToWorkflowRef.current.get(n.id) === workflowId) return false
        return true
      }),
    )
    setEdges((es) =>
      es.filter((e) => {
        if (taskToWorkflowRef.current.get(e.source) === workflowId) return false
        if (taskToWorkflowRef.current.get(e.target) === workflowId) return false
        if (e.id.includes(workflowId)) return false
        return true
      }),
    )
    if (selectedWorkflowDetail?.id === workflowId) setSelectedWorkflowDetail(null)
  }

  function shiftWorkflowsBelow(fromIndex: number, deltaY: number) {
    setNodes((ns) =>
      ns.map((n) => {
        if (n.type === 'workflowHeader') {
          const wfId = n.data.workflowId as string
          const idx = workflowsDataRef.current.findIndex((w) => w.workflow.id === wfId)
          if (idx < fromIndex) return n
          return { ...n, position: { ...n.position, y: n.position.y + deltaY } }
        }
        if (n.type === 'taskNode' || n.type === 'endGoalNode') {
          const wfId = n.type === 'taskNode'
            ? taskToWorkflowRef.current.get(n.id)
            : n.id.replace('__eg__', '')
          const idx = workflowsDataRef.current.findIndex((w) => w.workflow.id === wfId)
          if (idx < fromIndex) return n
          return { ...n, position: { ...n.position, y: n.position.y + deltaY } }
        }
        return n
      }),
    )
  }

  // ── handleOpenDetail ──────────────────────────────────────────────────────

  const handleOpenDetail = useCallback((workflowId: string) => {
    const wData = workflowsDataRef.current.find((w) => w.workflow.id === workflowId)
    if (wData) {
      setSelectedWorkflowDetail(wData.workflow)
      setSelectedTask(null)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  openDetailRef.current = handleOpenDetail
  openEndGoalDetailRef.current = handleOpenDetail

  // ── Archive / Delete workflow ─────────────────────────────────────────────

  const handleRequestArchive = useCallback((workflowId: string) => {
    setWorkflowActionDialog({ workflowId, mode: 'archive' })
  }, [])
  archiveRef.current = handleRequestArchive

  const handleRequestDelete = useCallback((workflowId: string) => {
    setWorkflowActionDialog({ workflowId, mode: 'delete' })
  }, [])
  deleteRef.current = handleRequestDelete

  async function handleConfirmWorkflowAction() {
    if (!workflowActionDialog) return
    const { workflowId } = workflowActionDialog
    setWorkflowActionDialog(null)
    try {
      await mutate(`/api/workflows/${workflowId}/archive`, { method: 'POST' })
    } catch { /* non-fatal — canvas is updated regardless */ }
    removeWorkflowFromCanvas(workflowId)
  }

  // ── handleToggleTask ──────────────────────────────────────────────────────

  const handleToggleTask = useCallback(
    async (id: string, newStatus: 'todo' | 'done') => {
      const workflowId = taskToWorkflowRef.current.get(id)
      if (!workflowId) return
      setIsEvaluating(true)
      try {
        const res = await mutate(`/api/tasks/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        })
        if (!res.ok) { showToast('Failed to update task status.'); return }
        const updated: Task = await res.json()
        taskMapRef.current.set(id, updated)
        const newWfsData = workflowsDataRef.current.map((wd) =>
          wd.workflow.id === workflowId
            ? { ...wd, tasks: wd.tasks.map((t) => (t.id === id ? updated : t)) }
            : wd,
        )
        workflowsDataRef.current = newWfsData
        setWorkflowsData(newWfsData)
        setNodes((ns) =>
          ns.map((n) => n.id === id ? { ...n, data: { ...n.data, status: updated.status } } : n),
        )
        await fetchAndApplyTaskStates(workflowId)

        if (newStatus === 'done') {
          const wfTasks = workflowsDataRef.current.find((w) => w.workflow.id === workflowId)?.tasks ?? []
          if (wfTasks.length > 0) {
            const allDone = wfTasks.every((t) => {
              const cur = taskMapRef.current.get(t.id) ?? t
              return cur.status === 'done'
            })
            if (allDone) setCompletionDialog(workflowId)
          }
        }
      } finally {
        setIsEvaluating(false)
      }
    },
    [showToast], // eslint-disable-line react-hooks/exhaustive-deps
  )
  toggleRef.current = handleToggleTask

  // ── handleAddTask ─────────────────────────────────────────────────────────

  const handleAddTask = useCallback(
    async (workflowId: string) => {
      const offset = getWorkflowOffset(workflowId)
      const existingPositions = nodesRef.current
        .filter((n) => n.type === 'taskNode' && taskToWorkflowRef.current.get(n.id) === workflowId)
        .map((n) => n.position)

      const minY = offset + WORKFLOW_HEADER_HEIGHT
      let preferredX = 100
      let preferredY = offset + WORKFLOW_HEADER_HEIGHT + 50
      if (existingPositions.length > 0) {
        preferredX = Math.max(...existingPositions.map((p) => p.x)) + NODE_WIDTH + 60
        preferredY = existingPositions[0].y
      }
      const { x, y: absY } = findFreePosition(preferredX, preferredY, existingPositions)
      const finalY = Math.max(minY, absY)
      const relY = absoluteToRelative(finalY, offset)
      ensureWorkflowHeight(workflowId, relY)

      setIsEvaluating(true)
      try {
        const res = await mutate('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workflow_id: workflowId, title: 'New task', position_x: x, position_y: relY }),
        })
        if (!res.ok) { showToast('Failed to create task.'); return }
        const newTask: Task = await res.json()
        taskMapRef.current.set(newTask.id, newTask)
        taskToWorkflowRef.current.set(newTask.id, workflowId)
        const newWfsData = workflowsDataRef.current.map((wd) =>
          wd.workflow.id === workflowId ? { ...wd, tasks: [...wd.tasks, newTask] } : wd,
        )
        workflowsDataRef.current = newWfsData
        setWorkflowsData(newWfsData)

        const newNode: Node = {
          id: newTask.id, type: 'taskNode', position: { x, y: finalY },
          data: {
            id: newTask.id, title: newTask.title, description: null,
            status: newTask.status, priority: newTask.priority,
            due_date: null, defer_date: null,
            isEvaluating: false, isEnabled: true,
            onToggle: stableToggle, onAddConnected: stableAddConnected, onAddBefore: stableAddBefore,
          } as TaskNodeData,
        }
        setEdges((es) => {
          const realEdges = es.filter(isRealEdge)
          setNodes((ns) => {
            const egNode = ns.find((n) => n.id === endGoalNodeId(workflowId))
            const others = ns.filter((n) => n.id !== endGoalNodeId(workflowId))
            return egNode ? [...others, newNode, egNode] : [...others, newNode]
          })
          return [...realEdges, ...rebuildAllSynthEdges(realEdges)]
        })
        await fetchAndApplyTaskStates(workflowId)
      } finally {
        setIsEvaluating(false)
      }
    },
    [showToast, stableToggle, stableAddConnected, stableAddBefore], // eslint-disable-line react-hooks/exhaustive-deps
  )
  addTaskRef.current = handleAddTask

  // ── handleAddConnectedTask ────────────────────────────────────────────────

  const handleAddConnectedTask = useCallback(
    async (sourceId: string) => {
      const workflowId = taskToWorkflowRef.current.get(sourceId)
      if (!workflowId) return
      const offset = getWorkflowOffset(workflowId)
      const sourceNode = nodesRef.current.find((n) => n.id === sourceId)
      const preferredX = (sourceNode?.position.x ?? 100) + NODE_WIDTH + 80
      const preferredY = sourceNode?.position.y ?? (offset + WORKFLOW_HEADER_HEIGHT + 50)

      const allPositions = nodesRef.current.filter((n) => n.type === 'taskNode').map((n) => n.position)
      const { x, y: absY } = findFreePosition(preferredX, preferredY, allPositions)
      const finalY = Math.max(offset + WORKFLOW_HEADER_HEIGHT, absY)
      const relY = absoluteToRelative(finalY, offset)
      ensureWorkflowHeight(workflowId, relY)

      setIsEvaluating(true)
      try {
        const taskRes = await mutate('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workflow_id: workflowId, title: 'New task', position_x: x, position_y: relY }),
        })
        if (!taskRes.ok) { showToast('Failed to create task.'); return }
        const newTask: Task = await taskRes.json()
        const depRes = await mutate('/api/dependencies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task_id: newTask.id, depends_on_task_id: sourceId }),
        })
        const newDep: ApiDep | null = depRes.ok ? await depRes.json() : null
        taskMapRef.current.set(newTask.id, newTask)
        taskToWorkflowRef.current.set(newTask.id, workflowId)
        const newWfsData = workflowsDataRef.current.map((wd) =>
          wd.workflow.id === workflowId
            ? { ...wd, tasks: [...wd.tasks, newTask], deps: newDep ? [...wd.deps, newDep] : wd.deps }
            : wd,
        )
        workflowsDataRef.current = newWfsData
        setWorkflowsData(newWfsData)

        const newNode: Node = {
          id: newTask.id, type: 'taskNode', position: { x, y: finalY },
          data: {
            id: newTask.id, title: newTask.title, description: null,
            status: newTask.status, priority: newTask.priority,
            due_date: null, defer_date: null,
            isEvaluating: false, isEnabled: false,
            onToggle: stableToggle, onAddConnected: stableAddConnected, onAddBefore: stableAddBefore,
          } as TaskNodeData,
        }
        setEdges((es) => {
          const realEdges = es.filter(isRealEdge)
          const newReal = newDep ? [...realEdges, depToEdge(newDep)] : realEdges
          setNodes((ns) => {
            const egNode = ns.find((n) => n.id === endGoalNodeId(workflowId))
            const others = ns.filter((n) => n.id !== endGoalNodeId(workflowId))
            return egNode ? [...others, newNode, egNode] : [...others, newNode]
          })
          return [...newReal, ...rebuildAllSynthEdges(newReal)]
        })
        await fetchAndApplyTaskStates(workflowId)
      } finally {
        setIsEvaluating(false)
      }
    },
    [showToast, stableToggle, stableAddConnected, stableAddBefore], // eslint-disable-line react-hooks/exhaustive-deps
  )
  addConnectedRef.current = handleAddConnectedTask

  // ── handleAddBeforeTask ───────────────────────────────────────────────────

  const handleAddBeforeTask = useCallback(
    async (targetId: string) => {
      const workflowId = taskToWorkflowRef.current.get(targetId)
      if (!workflowId) return
      const offset = getWorkflowOffset(workflowId)
      const targetNode = nodesRef.current.find((n) => n.id === targetId)
      const preferredX = (targetNode?.position.x ?? 300) - NODE_WIDTH - 80
      const preferredY = targetNode?.position.y ?? (offset + WORKFLOW_HEADER_HEIGHT + 50)

      const allPositions = nodesRef.current.filter((n) => n.type === 'taskNode').map((n) => n.position)
      const { x, y: absY } = findFreePosition(preferredX, preferredY, allPositions)
      const finalY = Math.max(offset + WORKFLOW_HEADER_HEIGHT, absY)
      const relY = absoluteToRelative(finalY, offset)
      ensureWorkflowHeight(workflowId, relY)

      setIsEvaluating(true)
      try {
        const taskRes = await mutate('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workflow_id: workflowId, title: 'New task', position_x: x, position_y: relY }),
        })
        if (!taskRes.ok) { showToast('Failed to create task.'); return }
        const newTask: Task = await taskRes.json()
        const depRes = await mutate('/api/dependencies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task_id: targetId, depends_on_task_id: newTask.id }),
        })
        const newDep: ApiDep | null = depRes.ok ? await depRes.json() : null
        taskMapRef.current.set(newTask.id, newTask)
        taskToWorkflowRef.current.set(newTask.id, workflowId)
        const newWfsData = workflowsDataRef.current.map((wd) =>
          wd.workflow.id === workflowId
            ? { ...wd, tasks: [...wd.tasks, newTask], deps: newDep ? [...wd.deps, newDep] : wd.deps }
            : wd,
        )
        workflowsDataRef.current = newWfsData
        setWorkflowsData(newWfsData)

        const newNode: Node = {
          id: newTask.id, type: 'taskNode', position: { x, y: finalY },
          data: {
            id: newTask.id, title: newTask.title, description: null,
            status: newTask.status, priority: newTask.priority,
            due_date: null, defer_date: null,
            isEvaluating: false, isEnabled: true,
            onToggle: stableToggle, onAddConnected: stableAddConnected, onAddBefore: stableAddBefore,
          } as TaskNodeData,
        }
        setEdges((es) => {
          const realEdges = es.filter(isRealEdge)
          const newReal = newDep ? [...realEdges, depToEdge(newDep)] : realEdges
          setNodes((ns) => {
            const egNode = ns.find((n) => n.id === endGoalNodeId(workflowId))
            const others = ns.filter((n) => n.id !== endGoalNodeId(workflowId))
            return egNode ? [...others, newNode, egNode] : [...others, newNode]
          })
          return [...newReal, ...rebuildAllSynthEdges(newReal)]
        })
        await fetchAndApplyTaskStates(workflowId)
      } finally {
        setIsEvaluating(false)
      }
    },
    [showToast, stableToggle, stableAddConnected, stableAddBefore], // eslint-disable-line react-hooks/exhaustive-deps
  )
  addBeforeRef.current = handleAddBeforeTask

  // ── handleAddTaskAfterTerminals ────────────────────────────────────────────

  const handleAddTaskAfterTerminals = useCallback(
    async (workflowId: string) => {
      const wData = workflowsDataRef.current.find((w) => w.workflow.id === workflowId)
      const offset = getWorkflowOffset(workflowId)
      let terminalIds: string[] = []
      if (wData) {
        const activeDeps = wData.deps.filter((d) => d.archived_at == null)
        terminalIds = findTerminalIds(wData.tasks, activeDeps)
      }
      const terminalNodes = terminalIds
        .map((id) => nodesRef.current.find((n) => n.id === id))
        .filter(Boolean) as Node[]
      const preferredX =
        terminalNodes.length > 0
          ? Math.max(...terminalNodes.map((n) => n.position.x)) + NODE_WIDTH + 80
          : 200
      const preferredY =
        terminalNodes.length > 0
          ? terminalNodes.reduce((s, n) => s + n.position.y, 0) / terminalNodes.length
          : offset + WORKFLOW_HEADER_HEIGHT + 50

      const allPositions = nodesRef.current.filter((n) => n.type === 'taskNode').map((n) => n.position)
      const { x, y: absY } = findFreePosition(preferredX, preferredY, allPositions)
      const finalY = Math.max(offset + WORKFLOW_HEADER_HEIGHT, absY)
      const relY = absoluteToRelative(finalY, offset)
      ensureWorkflowHeight(workflowId, relY)

      setIsEvaluating(true)
      try {
        const taskRes = await mutate('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workflow_id: workflowId, title: 'New task', position_x: x, position_y: relY }),
        })
        if (!taskRes.ok) { showToast('Failed to create task.'); return }
        const newTask: Task = await taskRes.json()

        const newDeps: ApiDep[] = []
        for (const termId of terminalIds) {
          const depRes = await mutate('/api/dependencies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ task_id: newTask.id, depends_on_task_id: termId }),
          })
          if (depRes.ok) newDeps.push(await depRes.json())
        }

        taskMapRef.current.set(newTask.id, newTask)
        taskToWorkflowRef.current.set(newTask.id, workflowId)
        const newWfsData = workflowsDataRef.current.map((wd) =>
          wd.workflow.id === workflowId
            ? { ...wd, tasks: [...wd.tasks, newTask], deps: [...wd.deps, ...newDeps] }
            : wd,
        )
        workflowsDataRef.current = newWfsData
        setWorkflowsData(newWfsData)

        const newNode: Node = {
          id: newTask.id, type: 'taskNode', position: { x, y: finalY },
          data: {
            id: newTask.id, title: newTask.title, description: null,
            status: newTask.status, priority: newTask.priority,
            due_date: null, defer_date: null,
            isEvaluating: false, isEnabled: terminalIds.length === 0,
            onToggle: stableToggle, onAddConnected: stableAddConnected, onAddBefore: stableAddBefore,
          } as TaskNodeData,
        }
        setEdges((es) => {
          const realEdges = [...es.filter(isRealEdge), ...newDeps.map(depToEdge)]
          setNodes((ns) => {
            const egNode = ns.find((n) => n.id === endGoalNodeId(workflowId))
            const others = ns.filter((n) => n.id !== endGoalNodeId(workflowId))
            return egNode ? [...others, newNode, egNode] : [...others, newNode]
          })
          return [...realEdges, ...rebuildAllSynthEdges(realEdges)]
        })
        await fetchAndApplyTaskStates(workflowId)
      } finally {
        setIsEvaluating(false)
      }
    },
    [showToast, stableToggle, stableAddConnected, stableAddBefore], // eslint-disable-line react-hooks/exhaustive-deps
  )
  addTaskBeforeEndGoalRef.current = handleAddTaskAfterTerminals

  // ── handleSaveEndGoal / handleSaveName ────────────────────────────────────

  const handleSaveEndGoal = useCallback(
    async (workflowId: string, newEndGoal: string | null) => {
      try {
        const res = await mutate(`/api/workflows/${workflowId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ end_goal: newEndGoal }),
        })
        if (!res.ok) { showToast('Failed to save end goal.'); return }
        updateWorkflowInState(workflowId, await res.json())
      } catch { showToast('Failed to save end goal.') }
    },
    [showToast], // eslint-disable-line react-hooks/exhaustive-deps
  )
  saveEndGoalRef.current = handleSaveEndGoal

  const handleSaveName = useCallback(
    async (workflowId: string, newName: string) => {
      try {
        const res = await mutate(`/api/workflows/${workflowId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName }),
        })
        if (!res.ok) { showToast('Failed to rename workflow.'); return }
        updateWorkflowInState(workflowId, await res.json())
      } catch { showToast('Failed to rename workflow.') }
    },
    [showToast], // eslint-disable-line react-hooks/exhaustive-deps
  )
  saveNameRef.current = handleSaveName

  function handleWorkflowDetailSaved(updated: Workflow) {
    updateWorkflowInState(updated.id, updated)
  }

  // ── onNodeDragStop ────────────────────────────────────────────────────────

  const onNodeDragStop: NodeDragHandler = useCallback(
    async (_event, node) => {
      // ── End goal node: save position ───────────────────────────────────────
      if (node.type === 'endGoalNode') {
        const wfId = node.id.replace('__eg__', '')
        const offset = getWorkflowOffset(wfId)
        const relY = absoluteToRelative(node.position.y, offset)
        try {
          await mutate(`/api/workflows/${wfId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eg_position_x: node.position.x, eg_position_y: relY }),
          })
          // Update local workflow data so position survives collapse/expand
          const newWfsData = workflowsDataRef.current.map((wd) =>
            wd.workflow.id === wfId
              ? { ...wd, workflow: { ...wd.workflow, eg_position_x: node.position.x, eg_position_y: relY } }
              : wd,
          )
          workflowsDataRef.current = newWfsData
          setWorkflowsData(newWfsData)
        } catch { /* non-fatal */ }
        return
      }

      // ── Task node: expand band if needed, save position ────────────────────
      if (node.type !== 'taskNode') return
      const workflowId = taskToWorkflowRef.current.get(node.id)
      if (!workflowId) return

      const offset = getWorkflowOffset(workflowId)
      const minY = offset + WORKFLOW_HEADER_HEIGHT
      const finalY = Math.max(minY, node.position.y)
      const relY = absoluteToRelative(finalY, offset)
      ensureWorkflowHeight(workflowId, relY)

      if (finalY !== node.position.y) {
        setNodes((ns) =>
          ns.map((n) => n.id === node.id ? { ...n, position: { ...n.position, y: finalY } } : n),
        )
      }

      // Update workflowsData so task position survives collapse/expand
      const newWfsData = workflowsDataRef.current.map((wd) =>
        wd.workflow.id === workflowId
          ? { ...wd, tasks: wd.tasks.map((t) => t.id === node.id ? { ...t, position_x: node.position.x, position_y: relY } : t) }
          : wd,
      )
      workflowsDataRef.current = newWfsData
      setWorkflowsData(newWfsData)

      try {
        await mutate(`/api/tasks/${node.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ position_x: node.position.x, position_y: relY }),
        })
      } catch { /* non-fatal */ }
    },
    [projectId], // eslint-disable-line react-hooks/exhaustive-deps
  )

  // ── onConnect ─────────────────────────────────────────────────────────────

  const onConnect = useCallback(
    async (connection: Connection) => {
      if (!connection.source || !connection.target) return
      const isEgTarget = connection.target.startsWith('__eg__')
      const srcWorkflow = taskToWorkflowRef.current.get(connection.source)
      if (isEgTarget) {
        const egWorkflowId = connection.target.replace('__eg__', '')
        if (srcWorkflow !== egWorkflowId) {
          showToast('Cannot connect tasks from different workflows.')
          return
        }
        // Add a pinned visual edge from this task to the end goal
        const edgeId = pinnedEgEdgeId(connection.source, egWorkflowId)
        setEdges((es) => {
          if (es.some((e) => e.id === edgeId)) return es
          const withPinned = [...es, {
            id: edgeId,
            source: connection.source!,
            target: connection.target!,
            style: { strokeDasharray: '4 4', stroke: '#7c3aed' },
            zIndex: -1,
          }]
          // Remove any synth edge for this task since it's now pinned
          const synthId = syntheticEdgeId(connection.source!, egWorkflowId)
          const withoutRedundantSynth = withPinned.filter((e) => e.id !== synthId)
          return withoutRedundantSynth
        })
        return
      }
      const tgtWorkflow = taskToWorkflowRef.current.get(connection.target)
      if (srcWorkflow !== tgtWorkflow) { showToast('Cannot connect tasks from different workflows.'); return }
      const workflowId = srcWorkflow!
      setIsEvaluating(true)
      try {
        const res = await mutate('/api/dependencies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task_id: connection.target, depends_on_task_id: connection.source }),
        })
        if (res.status === 409) {
          showToast((await res.json().catch(() => ({}))).error ?? 'This dependency would create a cycle.')
          return
        }
        if (!res.ok) { showToast('Failed to create dependency.'); return }
        const dep: ApiDep = await res.json()
        const newWfsData = workflowsDataRef.current.map((wd) =>
          wd.workflow.id === workflowId ? { ...wd, deps: [...wd.deps, dep] } : wd,
        )
        workflowsDataRef.current = newWfsData
        setWorkflowsData(newWfsData)
        setEdges((es) => {
          const realEdges = addEdge(depToEdge(dep), es.filter(isRealEdge))
          return [...realEdges, ...rebuildAllSynthEdges(realEdges)]
        })
        await fetchAndApplyTaskStates(workflowId)
      } finally { setIsEvaluating(false) }
    },
    [showToast], // eslint-disable-line react-hooks/exhaustive-deps
  )

  // ── onEdgeClick — deselects task detail panel when edge is clicked ────────

  const onEdgeClick: EdgeMouseHandler = useCallback(() => {
    setSelectedTask(null)
    setSelectedWorkflowDetail(null)
  }, [])

  // ── onEdgesDelete — fires when selected edges are deleted via keyboard ─────

  const onEdgesDelete = useCallback(
    async (deletedEdges: Edge[]) => {
      // Rebuild synth edges after ReactFlow has already removed the edges from state
      setEdges((es) => {
        const r = es.filter(isRealEdge)
        return [...r, ...rebuildAllSynthEdges(r)]
      })

      // Skip edges connected to nodes currently being deleted (handled by onNodesDelete)
      const edgesToProcess = deletedEdges.filter(
        (e) =>
          isTaskDepEdge(e) &&
          !deletingTaskIdsRef.current.has(e.source) &&
          !deletingTaskIdsRef.current.has(e.target),
      )

      if (edgesToProcess.length === 0) return

      for (const edge of edgesToProcess) {
        const workflowId = taskToWorkflowRef.current.get(edge.source)
        if (!workflowId) continue
        const dep = workflowsDataRef.current.flatMap((wd) => wd.deps).find((d) => d.id === edge.id)
        if (!dep || dep.archived_at != null) continue

        await doArchiveDep(edge.id)
        const newWfsData = workflowsDataRef.current.map((wd) =>
          wd.workflow.id === workflowId
            ? { ...wd, deps: wd.deps.map((d) => d.id === edge.id ? { ...d, archived_at: Math.floor(Date.now() / 1000) } : d) }
            : wd,
        )
        workflowsDataRef.current = newWfsData
        setWorkflowsData(newWfsData)
        await fetchAndApplyTaskStates(workflowId)
      }

      // Offer undo for a single dep deletion
      if (edgesToProcess.length === 1) {
        const edge = edgesToProcess[0]
        const workflowId = taskToWorkflowRef.current.get(edge.source)
        const dep = workflowsDataRef.current.flatMap((wd) => wd.deps).find((d) => d.id === edge.id)
        if (workflowId && dep) {
          setUndoSnapshot({ type: 'dep', depId: edge.id, taskId: dep.task_id, dependsOnTaskId: dep.depends_on_task_id, workflowId })
        }
      }
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  )

  // ── onNodesDelete — fires when selected task nodes are deleted via keyboard ─

  const onNodesDelete = useCallback(
    async (deletedNodes: Node[]) => {
      const taskNodes = deletedNodes.filter((n) => n.type === 'taskNode')
      if (taskNodes.length === 0) return

      // Mark synchronously so onEdgesDelete (which may fire next) skips these edges
      taskNodes.forEach((n) => deletingTaskIdsRef.current.add(n.id))

      try {
        for (const node of taskNodes) {
          const workflowId = taskToWorkflowRef.current.get(node.id)
          if (!workflowId) continue

          const task = taskMapRef.current.get(node.id)
          const wData = workflowsDataRef.current.find((w) => w.workflow.id === workflowId)
          const activeDeps = (wData?.deps ?? []).filter(
            (d) => d.archived_at == null && (d.task_id === node.id || d.depends_on_task_id === node.id),
          )

          try {
            await mutate(`/api/tasks/${node.id}/archive`, { method: 'POST' })
          } catch { /* non-fatal */ }

          const newWfsData = workflowsDataRef.current.map((wd) =>
            wd.workflow.id === workflowId
              ? {
                  ...wd,
                  tasks: wd.tasks.filter((t) => t.id !== node.id),
                  deps: wd.deps.map((d) =>
                    d.task_id === node.id || d.depends_on_task_id === node.id
                      ? { ...d, archived_at: Math.floor(Date.now() / 1000) }
                      : d,
                  ),
                }
              : wd,
          )
          workflowsDataRef.current = newWfsData
          setWorkflowsData(newWfsData)

          // Remove this task's edges from canvas and rebuild synth
          setEdges((es) => {
            const r = es.filter((e) => isRealEdge(e) && e.source !== node.id && e.target !== node.id)
            return [...r, ...rebuildAllSynthEdges(r)]
          })

          setSelectedTask((prev) => (prev?.id === node.id ? null : prev))

          await fetchAndApplyTaskStates(workflowId)

          // Offer undo for single task deletion
          if (taskNodes.length === 1 && task) {
            setUndoSnapshot({
              type: 'task',
              taskId: node.id,
              workflowId,
              taskNode: node,
              task,
              removedDeps: activeDeps.map((d) => ({ taskId: d.task_id, dependsOnTaskId: d.depends_on_task_id })),
            })
          }
        }
      } finally {
        taskNodes.forEach((n) => deletingTaskIdsRef.current.delete(n.id))
      }
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  )

  async function doArchiveDep(id: string) {
    try {
      await mutate(`/api/dependencies/${id}/archive`, { method: 'POST' })
    } catch { /* non-fatal */ }
  }

  async function handleUndo() {
    if (!undoSnapshot) return
    const snapshot = undoSnapshot
    setUndoSnapshot(null)

    if (snapshot.type === 'dep') {
      const { taskId, dependsOnTaskId, workflowId } = snapshot
      try {
        const res = await mutate('/api/dependencies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task_id: taskId, depends_on_task_id: dependsOnTaskId }),
        })
        if (!res.ok) { showToast('Could not restore dependency.'); return }
        const dep: ApiDep = await res.json()
        const newWfsData = workflowsDataRef.current.map((wd) =>
          wd.workflow.id === workflowId ? { ...wd, deps: [...wd.deps, dep] } : wd,
        )
        workflowsDataRef.current = newWfsData
        setWorkflowsData(newWfsData)
        setEdges((es) => {
          const realEdges = [...es.filter(isRealEdge), depToEdge(dep)]
          return [...realEdges, ...rebuildAllSynthEdges(realEdges)]
        })
        await fetchAndApplyTaskStates(workflowId)
      } catch { showToast('Could not restore dependency.') }
      return
    }

    if (snapshot.type === 'task') {
      const { taskId, workflowId, taskNode, task, removedDeps } = snapshot
      try {
        const unarchiveRes = await mutate(`/api/tasks/${taskId}/unarchive`, { method: 'POST' })
        if (!unarchiveRes.ok) { showToast('Could not restore task.'); return }
        const restoredTask: Task = await unarchiveRes.json()

        // Restore deps
        const restoredDeps: ApiDep[] = []
        for (const { taskId: tid, dependsOnTaskId: dtid } of removedDeps) {
          const depRes = await mutate('/api/dependencies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ task_id: tid, depends_on_task_id: dtid }),
          })
          if (depRes.ok) restoredDeps.push(await depRes.json())
        }

        taskMapRef.current.set(taskId, restoredTask)
        taskToWorkflowRef.current.set(taskId, workflowId)

        const newWfsData = workflowsDataRef.current.map((wd) =>
          wd.workflow.id === workflowId
            ? { ...wd, tasks: [...wd.tasks, restoredTask], deps: [...wd.deps, ...restoredDeps] }
            : wd,
        )
        workflowsDataRef.current = newWfsData
        setWorkflowsData(newWfsData)

        const restoredNode: Node = {
          ...taskNode,
          data: {
            ...taskNode.data,
            status: restoredTask.status,
            isEvaluating: false,
            isEnabled: true,
            onToggle: stableToggle,
            onAddConnected: stableAddConnected,
            onAddBefore: stableAddBefore,
          },
        }

        setNodes((ns) => {
          const egNode = ns.find((n) => n.id === endGoalNodeId(workflowId))
          const others = ns.filter((n) => n.id !== endGoalNodeId(workflowId))
          return egNode ? [...others, restoredNode, egNode] : [...others, restoredNode]
        })

        setEdges((es) => {
          const realEdges = [...es.filter(isRealEdge), ...restoredDeps.map(depToEdge)]
          return [...realEdges, ...rebuildAllSynthEdges(realEdges)]
        })

        await fetchAndApplyTaskStates(workflowId)
      } catch { showToast('Could not restore task.') }
    }
  }

  // ── onNodeClick ───────────────────────────────────────────────────────────

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    if (node.type === 'taskNode') {
      const task = taskMapRef.current.get(node.id)
      if (task) { setSelectedTask(task); setSelectedWorkflowDetail(null) }
    }
  }, [])

  function handleTaskUpdated(updated: Task) {
    taskMapRef.current.set(updated.id, updated)
    setNodes((ns) =>
      ns.map((n) =>
        n.id === updated.id
          ? { ...n, data: { ...n.data, title: updated.title, description: updated.description, status: updated.status, due_date: updated.due_date ?? null, defer_date: updated.defer_date ?? null } }
          : n,
      ),
    )
    setSelectedTask(updated)
    const workflowId = taskToWorkflowRef.current.get(updated.id)
    if (workflowId) fetchAndApplyTaskStates(workflowId)
  }

  // ── Completion dialog ─────────────────────────────────────────────────────

  async function handleWorkflowCompleted(workflowId: string) {
    setCompletionDialog(null)
    try {
      await mutate(`/api/workflows/${workflowId}/archive`, { method: 'POST' })
    } catch { /* non-fatal */ }
    removeWorkflowFromCanvas(workflowId)
  }

  async function handleWorkflowNotCompleted(workflowId: string) {
    setCompletionDialog(null)
    await handleAddTaskAfterTerminals(workflowId)
  }

  // ── Create workflow ───────────────────────────────────────────────────────

  async function handleCreateWorkflow(e: React.FormEvent) {
    e.preventDefault()
    if (!newWfName.trim()) return
    setCreatingWf(true)
    try {
      const res = await mutate('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, name: newWfName.trim(), end_goal: newWfEndGoal.trim() || null }),
      })
      if (!res.ok) { showToast('Failed to create workflow.'); return }
      const newWf: Workflow = await res.json()
      const newWfData: WorkflowWithData = { workflow: newWf, tasks: [], deps: [] }
      const allData = [...workflowsDataRef.current, newWfData]
      const h = workflowHeightsRef.current.get(newWf.id) ?? WORKFLOW_CONTENT_HEIGHT
      const offsets = computeWorkflowOffsets(allData, workflowHeightsRef.current)
      const bandOffset = offsets[allData.length - 1] ?? 0
      workflowsDataRef.current = allData
      setWorkflowsData(allData)
      const { nodes: wfNodes, edges: wfEdges } = buildWorkflowGraph(
        newWfData, bandOffset, h,
        stableToggle, stableAddConnected, stableAddBefore,
        stableAddTask, stableSaveEndGoal, stableSaveName,
        stableOpenDetail, stableArchive, stableDelete,
        stableOpenEndGoalDetail, stableAddTaskBeforeEndGoal,
      )
      setNodes((ns) => [...ns, ...wfNodes])
      setEdges((es) => [...es, ...wfEdges])
      setNewWfName(''); setNewWfEndGoal(''); setShowCreateWorkflow(false)
    } finally { setCreatingWf(false) }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full w-full">
      <div className="relative flex flex-1 min-h-0">
        <div className="relative flex-1">
          {undoSnapshot && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
              <UndoToast
                message={undoSnapshot.type === 'task' ? 'Task removed.' : 'Dependency removed.'}
                onUndo={handleUndo}
                onDismiss={() => setUndoSnapshot(null)}
              />
            </div>
          )}

          {/* Workflow completion dialog */}
          {completionDialog && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40">
              <div className="bg-slate-800 border border-slate-600 rounded-lg p-6 w-80 shadow-xl">
                <p className="text-white text-sm font-semibold mb-2">All tasks complete!</p>
                <p className="text-slate-300 text-sm mb-5">Does this mean the workflow is completed?</p>
                <div className="flex gap-3">
                  <button onClick={() => handleWorkflowCompleted(completionDialog)} className="flex-1 rounded bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-500">Yes, archive it</button>
                  <button onClick={() => handleWorkflowNotCompleted(completionDialog)} className="flex-1 rounded bg-slate-600 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-500">No, add a task</button>
                </div>
              </div>
            </div>
          )}

          {/* Archive / delete confirmation */}
          {workflowActionDialog && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40">
              <div className="bg-slate-800 border border-slate-600 rounded-lg p-6 w-96 shadow-xl">
                {workflowActionDialog.mode === 'archive' ? (
                  <>
                    <p className="text-white text-sm font-semibold mb-2">Archive this workflow?</p>
                    <p className="text-slate-300 text-sm mb-5">All tasks inside will also be archived.</p>
                    <div className="flex gap-3">
                      <button onClick={handleConfirmWorkflowAction} className="flex-1 rounded bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-500">Archive</button>
                      <button onClick={() => setWorkflowActionDialog(null)} className="flex-1 rounded bg-slate-600 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-500">Cancel</button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-white text-sm font-semibold mb-2">Delete this workflow permanently?</p>
                    <p className="text-slate-300 text-sm mb-5">This cannot be undone. All tasks inside will also be deleted.</p>
                    <div className="flex gap-3">
                      <button onClick={handleConfirmWorkflowAction} className="flex-1 rounded bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-500">Delete</button>
                      <button onClick={() => setWorkflowActionDialog(null)} className="flex-1 rounded bg-slate-600 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-500">Cancel</button>
                    </div>
                  </>
                )}
              </div>
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
            onEdgesDelete={onEdgesDelete}
            onNodesDelete={onNodesDelete}
            onNodeClick={onNodeClick}
            deleteKeyCode={['Backspace', 'Delete']}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.1 }}
            className="bg-slate-950"
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#334155" gap={20} />
            <Controls />
            <MiniMap nodeColor="#3b82f6" maskColor="rgba(15,23,42,0.7)" pannable zoomable />
          </ReactFlow>
        </div>

        {selectedTask && !selectedWorkflowDetail && (
          <TaskDetailPanel task={selectedTask} onClose={() => setSelectedTask(null)} onUpdated={handleTaskUpdated} />
        )}
        {selectedWorkflowDetail && (
          <WorkflowDetailPanel workflow={selectedWorkflowDetail} onClose={() => setSelectedWorkflowDetail(null)} onUpdated={handleWorkflowDetailSaved} />
        )}
      </div>

      <div className="flex-shrink-0 border-t border-slate-700 bg-slate-900 px-4 py-2">
        {showCreateWorkflow ? (
          <form onSubmit={handleCreateWorkflow} className="flex items-center gap-2">
            <input autoFocus value={newWfName} onChange={(e) => setNewWfName(e.target.value)} placeholder="Workflow name" maxLength={200} className="rounded bg-slate-800 border border-slate-600 px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 w-48" />
            <input value={newWfEndGoal} onChange={(e) => setNewWfEndGoal(e.target.value)} placeholder="End goal (optional)" maxLength={2000} className="rounded bg-slate-800 border border-slate-600 px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 flex-1 max-w-xs" />
            <button type="submit" disabled={!newWfName.trim() || creatingWf} className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50">{creatingWf ? 'Creating…' : 'Create'}</button>
            <button type="button" onClick={() => setShowCreateWorkflow(false)} className="text-slate-400 hover:text-white text-xs px-2 py-1.5">Cancel</button>
          </form>
        ) : (
          <button onClick={() => setShowCreateWorkflow(true)} className="rounded bg-slate-700 border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-600 transition-colors">
            + New Workflow
          </button>
        )}
      </div>
    </div>
  )
}

// ── Public wrapper ────────────────────────────────────────────────────────────

interface WorkflowGraphProps { projectId: string }

export function WorkflowGraph({ projectId }: WorkflowGraphProps) {
  const [workflowsData, setWorkflowsData] = useState<WorkflowWithData[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setWorkflowsData(null)
    setError(null)
    fetch(`/api/workflows?project_id=${projectId}`)
      .then((r) => r.json())
      .then(async (workflows: Workflow[]) => {
        const loaded: WorkflowWithData[] = await Promise.all(
          workflows.map(async (workflow) => {
            const [tasks, deps] = await Promise.all([
              fetch(`/api/tasks?workflow_id=${workflow.id}`).then((r) => r.json()) as Promise<Task[]>,
              fetch(`/api/dependencies?workflow_id=${workflow.id}`).then((r) => r.json()) as Promise<ApiDep[]>,
            ])
            return { workflow, tasks, deps }
          }),
        )
        setWorkflowsData(loaded)
      })
      .catch(() => setError('Failed to load project data.'))
  }, [projectId])

  if (error) return <p className="text-red-400 p-6">{error}</p>
  if (!workflowsData) return <p className="text-slate-400 p-6">Loading…</p>

  return (
    <ReactFlowProvider>
      <WorkflowGraphInner projectId={projectId} initialWorkflowsData={workflowsData} />
    </ReactFlowProvider>
  )
}
