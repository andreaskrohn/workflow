/**
 * Canonical task-state business rules.
 *
 * Rule 1  — A task with status 'blocked' is never enabled.
 * Rule 2  — A task with no prerequisites is enabled when not blocked.
 * Rule 3  — A task with status 'done' is always enabled, regardless of
 *            ancestor state (it was completed explicitly by the user).
 * Rule 4  — A todo task requires ALL direct prerequisites to have status 'done'.
 * Rule 5  — Enablement is transitive: every ancestor must be 'done', not just
 *            direct predecessors (A→B→C: C disabled if B not done even if A is).
 * Rule 6  — Multiple predecessors: ALL must be done, not just one.
 * Rule 7  — A cycle in the dependency graph does not crash the evaluator.
 * Rule 8  — Archiving a task soft-deletes (sets archived_at) every active dep
 *            edge where that task is the dependent (task_id).
 *            Implemented in: lib/db/repositories/taskRepository.archiveTask
 * Rule 9  — Archiving a task soft-deletes every active dep edge where that
 *            task is the dependency target (depends_on_task_id).
 *            Implemented in: lib/db/repositories/taskRepository.archiveTask
 * Rule 10 — Pre-archived dep edges are not overwritten on task archive;
 *            their original archived_at timestamp is preserved.
 *            Implemented in: lib/db/repositories/taskRepository.archiveTask
 */

export type TaskStatus = 'todo' | 'done' | 'blocked'

export interface TaskState {
  id: string
  status: TaskStatus
}

export interface DepEdge {
  task_id: string
  depends_on_task_id: string
}

/**
 * Returns the set of task IDs that are "enabled" (ready to work on, or done).
 * Implements Rules 1–7.
 *
 * Caller is responsible for passing only active (non-archived) deps.
 */
export function computeEnabledTasks(tasks: TaskState[], deps: DepEdge[]): Set<string> {
  const statusMap = new Map(tasks.map((t) => [t.id, t.status]))

  const prereqMap = new Map<string, string[]>()
  for (const dep of deps) {
    const list = prereqMap.get(dep.task_id) ?? []
    list.push(dep.depends_on_task_id)
    prereqMap.set(dep.task_id, list)
  }

  function allAncestorsDone(taskId: string, visited: Set<string>): boolean {
    if (visited.has(taskId)) return true // Rule 7: cycle guard
    visited.add(taskId)
    const prereqs = prereqMap.get(taskId) ?? []
    return prereqs.every(
      (pid) => statusMap.get(pid) === 'done' && allAncestorsDone(pid, visited),
    )
  }

  const enabled = new Set<string>()
  for (const t of tasks) {
    if (t.status === 'blocked') continue           // Rule 1
    if (t.status === 'done') { enabled.add(t.id); continue } // Rule 3
    if (allAncestorsDone(t.id, new Set())) {       // Rules 4, 5, 6
      enabled.add(t.id)
    }
  }
  return enabled
}
