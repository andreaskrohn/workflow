import Database from 'better-sqlite3'

export interface TaskEnabledState {
  id: string
  enabled: boolean
}

/**
 * Server-side evaluation of which tasks in a workflow are "enabled"
 * (ready to work on). Reads directly from the DB so always reflects
 * the canonical state after any mutation.
 *
 * A task is enabled if:
 *   - It is not archived
 *   - Its status is not 'blocked'
 *   - ALL ancestors (not just direct predecessors) have status = 'done'
 *
 * Transitive closure: if A→B→C, C is only enabled when both A and B are done.
 * A task with no predecessors is always enabled (unless blocked/archived).
 */
export function evaluateWorkflowStates(
  db: Database.Database,
  workflowId: string,
): TaskEnabledState[] {
  const tasks = db
    .prepare<[string]>(`
      SELECT id, status
      FROM   tasks
      WHERE  workflow_id = ? AND archived_at IS NULL
    `)
    .all(workflowId) as { id: string; status: string }[]

  if (tasks.length === 0) return []

  const deps = db
    .prepare<[string]>(`
      SELECT d.task_id, d.depends_on_task_id
      FROM   task_dependencies d
      JOIN   tasks t ON d.task_id = t.id
      WHERE  t.workflow_id  = ?
        AND  d.archived_at IS NULL
    `)
    .all(workflowId) as { task_id: string; depends_on_task_id: string }[]

  const statusMap = new Map(tasks.map((t) => [t.id, t.status]))

  const prereqMap = new Map<string, string[]>()
  for (const dep of deps) {
    const list = prereqMap.get(dep.task_id) ?? []
    list.push(dep.depends_on_task_id)
    prereqMap.set(dep.task_id, list)
  }

  function allAncestorsDone(taskId: string, visited: Set<string>): boolean {
    if (visited.has(taskId)) return true // cycle guard
    visited.add(taskId)
    const prereqs = prereqMap.get(taskId) ?? []
    return prereqs.every(
      (pid) => statusMap.get(pid) === 'done' && allAncestorsDone(pid, visited),
    )
  }

  return tasks.map((t) => {
    if (t.status === 'blocked') return { id: t.id, enabled: false }
    return { id: t.id, enabled: allAncestorsDone(t.id, new Set()) }
  })
}
