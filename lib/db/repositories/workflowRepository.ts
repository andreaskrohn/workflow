import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Workflow {
  id: string
  project_id: string
  name: string
  end_goal: string | null
  due_date: number | null
  review_date: number | null
  sort_order: number
  archived_at: number | null
  eg_position_x: number | null
  eg_position_y: number | null
  created_at: number
  updated_at: number
}

export interface CreateWorkflowInput {
  id?: string
  project_id: string
  name: string
  end_goal?: string | null
  due_date?: number | null
}

export interface UpdateWorkflowInput {
  name?: string
  end_goal?: string | null
  due_date?: number | null
  review_date?: number | null
  archived_at?: number | null
  eg_position_x?: number | null
  eg_position_y?: number | null
}

// ── Functions ─────────────────────────────────────────────────────────────────

export function createWorkflow(
  db: Database.Database,
  input: CreateWorkflowInput,
): Workflow {
  const id = input.id ?? randomUUID()
  const now = Math.floor(Date.now() / 1000)

  const row = db
    .prepare('SELECT COALESCE(MAX(sort_order) + 1, 0) AS next FROM workflows WHERE project_id = ?')
    .get(input.project_id) as { next: number }
  const sortOrder = row.next

  db.prepare(`
    INSERT INTO workflows (id, project_id, name, end_goal, due_date, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, input.project_id, input.name, input.end_goal ?? null, input.due_date ?? null, sortOrder, now, now)

  return getWorkflowById(db, id)!
}

export function getWorkflowById(
  db: Database.Database,
  id: string,
): Workflow | undefined {
  return db.prepare('SELECT * FROM workflows WHERE id = ?').get(id) as Workflow | undefined
}

export function listWorkflows(
  db: Database.Database,
  options: { projectId?: string } = {},
): Workflow[] {
  if (options.projectId) {
    return db
      .prepare('SELECT * FROM workflows WHERE project_id = ? AND archived_at IS NULL ORDER BY sort_order ASC, created_at ASC')
      .all(options.projectId) as Workflow[]
  }
  return db
    .prepare('SELECT * FROM workflows WHERE archived_at IS NULL ORDER BY sort_order ASC, created_at ASC')
    .all() as Workflow[]
}

export function updateWorkflow(
  db: Database.Database,
  id: string,
  input: UpdateWorkflowInput,
): Workflow | undefined {
  const existing = getWorkflowById(db, id)
  if (!existing) return undefined

  const now = Math.floor(Date.now() / 1000)

  db.prepare(`
    UPDATE workflows
    SET name          = ?,
        end_goal      = ?,
        due_date      = ?,
        review_date   = ?,
        archived_at   = ?,
        eg_position_x = ?,
        eg_position_y = ?,
        updated_at    = ?
    WHERE id = ?
  `).run(
    input.name ?? existing.name,
    'end_goal' in input ? input.end_goal : existing.end_goal,
    'due_date' in input ? input.due_date : existing.due_date,
    'review_date' in input ? input.review_date : existing.review_date,
    'archived_at' in input ? input.archived_at : existing.archived_at,
    'eg_position_x' in input ? input.eg_position_x : existing.eg_position_x,
    'eg_position_y' in input ? input.eg_position_y : existing.eg_position_y,
    now,
    id,
  )

  return getWorkflowById(db, id)!
}

export function reorderWorkflows(
  db: Database.Database,
  projectId: string,
  orderedIds: string[],
): void {
  const update = db.prepare('UPDATE workflows SET sort_order = ? WHERE id = ? AND project_id = ?')
  const txn = db.transaction(() => {
    orderedIds.forEach((id, index) => {
      update.run(index, id, projectId)
    })
  })
  txn()
}

/**
 * Archive a workflow and all its tasks and dependency edges in one transaction.
 * Uses soft delete (sets archived_at) — never hard-deletes per CLAUDE.md.
 */
export function archiveWorkflowWithTasks(
  db: Database.Database,
  workflowId: string,
): void {
  const now = Math.floor(Date.now() / 1000)

  const doArchive = db.transaction(() => {
    const taskRows = db
      .prepare('SELECT id FROM tasks WHERE workflow_id = ? AND archived_at IS NULL')
      .all(workflowId) as { id: string }[]
    const taskIds = taskRows.map((r) => r.id)

    if (taskIds.length > 0) {
      const ph = taskIds.map(() => '?').join(',')

      // Soft-archive dependency edges (never hard DELETE per CLAUDE.md)
      db.prepare(
        `UPDATE task_dependencies SET archived_at = ?
         WHERE (task_id IN (${ph}) OR depends_on_task_id IN (${ph}))
           AND archived_at IS NULL`,
      ).run(now, ...taskIds, ...taskIds)

      // Remove FTS entries (belt-and-suspenders alongside trigger)
      db.prepare(`DELETE FROM tasks_fts WHERE rowid IN (${ph})`).run(...taskIds)

      // Archive tasks
      db.prepare(
        `UPDATE tasks SET archived_at = ?, updated_at = ? WHERE id IN (${ph})`,
      ).run(now, now, ...taskIds)
    }

    db.prepare('UPDATE workflows SET archived_at = ?, updated_at = ? WHERE id = ?')
      .run(now, now, workflowId)
  })

  doArchive()
}
