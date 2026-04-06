export interface TaskState {
  id: string
  status: 'todo' | 'done' | 'blocked'
}

export interface DepEdge {
  task_id: string
  depends_on_task_id: string
}

/**
 * Returns the set of task IDs that are "enabled" (ready to work on or already done).
 * A task is enabled if:
 * - Its status is not 'blocked'
 * - ALL ancestors (transitive closure, not just direct predecessors) have status 'done'
 *
 * Transitive closure: if A→B→C, C is only enabled when both A and B are done.
 * Caller is responsible for passing only active (non-archived) deps.
 */
export function computeEnabledTasks(
  tasks: TaskState[],
  deps: DepEdge[],
): Set<string> {
  const statusMap = new Map(tasks.map((t) => [t.id, t.status]))

  const prereqs = new Map<string, string[]>()
  for (const d of deps) {
    const list = prereqs.get(d.task_id)
    if (list) {
      list.push(d.depends_on_task_id)
    } else {
      prereqs.set(d.task_id, [d.depends_on_task_id])
    }
  }

  function allAncestorsDone(taskId: string, visited: Set<string>): boolean {
    if (visited.has(taskId)) return true // cycle guard
    visited.add(taskId)
    const ps = prereqs.get(taskId) ?? []
    return ps.every(
      (pid) => statusMap.get(pid) === 'done' && allAncestorsDone(pid, visited),
    )
  }

  const enabled = new Set<string>()
  for (const t of tasks) {
    if (t.status === 'blocked') continue
    if (allAncestorsDone(t.id, new Set())) {
      enabled.add(t.id)
    }
  }

  return enabled
}
