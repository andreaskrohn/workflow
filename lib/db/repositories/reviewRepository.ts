import Database from 'better-sqlite3'
import { computeEnabledTasks } from '@/lib/graph/taskState'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WorkflowReviewItem {
  id: string
  name: string
  end_goal: string | null
  /** Unix timestamp (seconds) of when the review is/was due. */
  review_date: number
  /**
   * Number of tasks in this workflow that are currently actionable:
   * status = 'todo', not blocked, and all dependencies satisfied.
   */
  enabled_task_count: number
}

// ── Query ─────────────────────────────────────────────────────────────────────

/**
 * Returns active (non-archived) workflows whose `review_date` is today or
 * in the past, ordered by `review_date ASC` (most overdue first).
 *
 * Each item is enriched with the count of enabled (actionable) todo tasks
 * in that workflow. Dependency resolution uses the same rules as
 * `computeEnabledTasks` from `lib/graph/taskState`.
 *
 * @param db Open better-sqlite3 database instance.
 */
export function listWorkflowsDueForReview(db: Database.Database): WorkflowReviewItem[] {
  // Use UTC-midnight tomorrow as the exclusive upper bound so that a review
  // date of "today" (stored as UTC midnight) is included regardless of the
  // server's local timezone.
  const tomorrow = new Date()
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  tomorrow.setUTCHours(0, 0, 0, 0)
  const tomorrowTs = Math.floor(tomorrow.getTime() / 1000)

  const workflows = db
    .prepare(
      `SELECT id, name, end_goal, review_date
       FROM   workflows
       WHERE  review_date IS NOT NULL
         AND  review_date < ?
         AND  archived_at IS NULL
       ORDER BY review_date ASC`,
    )
    .all(tomorrowTs) as { id: string; name: string; end_goal: string | null; review_date: number }[]

  return workflows.map((wf) => {
    const tasks = db
      .prepare(
        'SELECT id, status FROM tasks WHERE workflow_id = ? AND archived_at IS NULL',
      )
      .all(wf.id) as { id: string; status: string }[]

    const deps = db
      .prepare(
        `SELECT d.task_id, d.depends_on_task_id
         FROM   task_dependencies d
         JOIN   tasks t ON d.task_id = t.id
         WHERE  t.workflow_id = ? AND d.archived_at IS NULL`,
      )
      .all(wf.id) as { task_id: string; depends_on_task_id: string }[]

    const enabledIds = computeEnabledTasks(tasks, deps)
    const enabledTaskCount = tasks.filter(
      (t) => t.status === 'todo' && enabledIds.has(t.id),
    ).length

    return {
      id: wf.id,
      name: wf.name,
      end_goal: wf.end_goal,
      review_date: wf.review_date,
      enabled_task_count: enabledTaskCount,
    }
  })
}
