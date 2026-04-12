import Database from 'better-sqlite3'
import type { Task } from './taskRepository'
import { computeEnabledTasks } from '@/lib/graph/taskState'

/**
 * Returns active, enabled todo tasks that carry at least one of the given tags
 * (OR logic), sorted by due_date ASC with nulls last.
 *
 * "Enabled" mirrors the Now-view rules:
 *  - Inbox tasks (workflow_id IS NULL) are always enabled.
 *  - Workflow tasks are enabled when all transitive prerequisites are done.
 *  - Blocked tasks are never enabled.
 *
 * @param db     Open better-sqlite3 database instance.
 * @param tagIds Tag UUIDs to filter by. Returns [] immediately when empty.
 */
export function listTasksByTags(db: Database.Database, tagIds: string[]): Task[] {
  if (tagIds.length === 0) return []

  const ph = tagIds.map(() => '?').join(',')

  // Candidates: active todo tasks with at least one active link to a selected tag.
  const candidates = db
    .prepare(
      `SELECT DISTINCT t.*
       FROM   tasks t
       JOIN   task_tags tt ON t.id = tt.task_id
       WHERE  t.archived_at IS NULL
         AND  t.status = 'todo'
         AND  tt.archived_at IS NULL
         AND  tt.tag_id IN (${ph})`,
    )
    .all(...tagIds) as Task[]

  if (candidates.length === 0) return []

  // ── Compute enablement (same pattern as nowRepository) ──────────────────────

  const enabledIds = new Set<string>()

  // Inbox tasks have no workflow dependencies — always enabled.
  for (const t of candidates) {
    if (t.workflow_id === null) enabledIds.add(t.id)
  }

  // For workflow tasks run computeEnabledTasks once per distinct workflow so we
  // can evaluate the full dependency graph (not just the tagged subset).
  const workflowIds = [
    ...new Set(
      candidates
        .filter((t) => t.workflow_id !== null)
        .map((t) => t.workflow_id as string),
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
         WHERE  t.workflow_id = ? AND d.archived_at IS NULL`,
      )
      .all(wfId) as { task_id: string; depends_on_task_id: string }[]

    for (const id of computeEnabledTasks(wfTasks, wfDeps)) enabledIds.add(id)
  }

  // ── Filter + sort ────────────────────────────────────────────────────────────

  const result = candidates.filter((t) => enabledIds.has(t.id))

  result.sort((a, b) => {
    if (a.due_date === null && b.due_date === null) return 0
    if (a.due_date === null) return 1
    if (b.due_date === null) return -1
    return a.due_date - b.due_date
  })

  return result
}
