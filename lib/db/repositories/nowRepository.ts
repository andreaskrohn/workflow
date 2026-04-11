import Database from 'better-sqlite3'
import type { Task } from './taskRepository'
import { computeEnabledTasks } from '@/lib/graph/taskState'

export function listNowTasks(db: Database.Database): Task[] {
  const now = Math.floor(Date.now() / 1000)

  const candidates = db
    .prepare(
      `SELECT * FROM tasks
       WHERE  archived_at IS NULL
         AND  status = 'todo'
         AND  (defer_date IS NULL OR defer_date <= ?)
       ORDER BY created_at DESC`,
    )
    .all(now) as Task[]

  if (candidates.length === 0) return []

  const enabledIds = new Set<string>()

  // Inbox tasks (no workflow) are always enabled
  for (const t of candidates) {
    if (t.workflow_id === null) enabledIds.add(t.id)
  }

  // For workflow tasks, run computeEnabledTasks per workflow
  const workflowIds = [
    ...new Set(
      candidates.filter((t) => t.workflow_id !== null).map((t) => t.workflow_id as string),
    ),
  ]

  for (const wfId of workflowIds) {
    const wfTasks = db
      .prepare(
        'SELECT id, status FROM tasks WHERE workflow_id = ? AND archived_at IS NULL',
      )
      .all(wfId) as { id: string; status: string }[]

    const wfDeps = db
      .prepare(
        `SELECT d.task_id, d.depends_on_task_id
         FROM   task_dependencies d
         JOIN   tasks t ON d.task_id = t.id
         WHERE  t.workflow_id = ?
           AND  d.archived_at IS NULL`,
      )
      .all(wfId) as { task_id: string; depends_on_task_id: string }[]

    for (const id of computeEnabledTasks(wfTasks, wfDeps)) enabledIds.add(id)
  }

  const result = candidates.filter((t) => enabledIds.has(t.id))

  result.sort((a, b) => {
    if (a.due_date === null && b.due_date === null) return 0
    if (a.due_date === null) return 1
    if (b.due_date === null) return -1
    return a.due_date - b.due_date
  })

  return result
}
