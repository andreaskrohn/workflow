import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'

// ── Types ─────────────────────────────────────────────────────────────────────

export type TaskStatus = 'todo' | 'done' | 'blocked'

export interface Task {
  id: string
  workflow_id: string | null
  title: string
  description: string | null
  notes: string | null
  status: TaskStatus
  priority: number
  due_date: number | null
  defer_date: number | null
  review_date: number | null
  created_at: number
  updated_at: number
  archived_at: number | null
  position_x: number | null
  position_y: number | null
  end_goal: string | null // deprecated — end_goal lives on workflows now
}

export interface CreateTaskInput {
  /** Optional UUID — generated if omitted. */
  id?: string
  workflow_id?: string | null
  title: string
  description?: string | null
  notes?: string | null
  /** Defaults to `'todo'`. */
  status?: TaskStatus
  /** 1 (lowest) – 5 (highest). Defaults to `3`. */
  priority?: number
  /** Unix timestamp, or `null` for no due date. */
  due_date?: number | null
  /** Unix timestamp, or `null` for no defer date. */
  defer_date?: number | null
  position_x?: number | null
  position_y?: number | null
}

export interface UpdateTaskInput {
  title?: string
  /** Pass `null` to explicitly clear the field. */
  description?: string | null
  /** Pass `null` to explicitly clear the field. */
  notes?: string | null
  status?: TaskStatus
  priority?: number
  /** Pass `null` to explicitly clear the field. */
  due_date?: number | null
  /** Pass `null` to explicitly clear the field. */
  defer_date?: number | null
  /** Pass `null` to explicitly clear the field. */
  review_date?: number | null
  position_x?: number | null
  position_y?: number | null
  end_goal?: string | null
  /** Pass `null` to move the task to the inbox (no workflow). */
  workflow_id?: string | null
}

// ── Functions ─────────────────────────────────────────────────────────────────

/**
 * Creates a new task and inserts it into the FTS index via the
 * `tasks_fts_insert` trigger.
 *
 * @param db    Open better-sqlite3 database instance.
 * @param input Task fields. `id` is optional; a UUID is generated if omitted.
 * @returns     The newly created task row.
 */
export function createTask(db: Database.Database, input: CreateTaskInput): Task {
  const id = input.id ?? randomUUID()
  const now = Math.floor(Date.now() / 1000)

  db.prepare(`
    INSERT INTO tasks (id, workflow_id, title, description, notes, status, priority, due_date, defer_date, created_at, updated_at, position_x, position_y)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.workflow_id ?? null,
    input.title,
    input.description ?? null,
    input.notes ?? null,
    input.status ?? 'todo',
    input.priority ?? 3,
    input.due_date ?? null,
    input.defer_date ?? null,
    now,
    now,
    input.position_x ?? null,
    input.position_y ?? null,
  )

  return getTaskById(db, id)!
}

/**
 * Returns a task by ID regardless of its archived state.
 *
 * @param db Open better-sqlite3 database instance.
 * @param id Task UUID.
 * @returns  The task row, or `undefined` if not found.
 */
export function getTaskById(db: Database.Database, id: string): Task | undefined {
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined
}

/**
 * Lists tasks, optionally including archived ones. Active tasks only by default.
 *
 * @param db                       Open better-sqlite3 database instance.
 * @param options.includeArchived  When `true`, archived tasks are included.
 * @param options.workflowId       Filter to tasks belonging to this workflow.
 * @param options.inbox            When `true`, returns only inbox tasks:
 *                                 workflow_id IS NULL AND archived_at IS NULL.
 * @returns                        Task rows ordered by `created_at` descending.
 */
export function listTasks(
  db: Database.Database,
  options: { includeArchived?: boolean; workflowId?: string; inbox?: boolean } = {},
): Task[] {
  if (options.inbox) {
    return db
      .prepare(
        'SELECT * FROM tasks WHERE workflow_id IS NULL AND archived_at IS NULL ORDER BY created_at DESC',
      )
      .all() as Task[]
  }
  if (options.workflowId) {
    const sql = options.includeArchived
      ? 'SELECT * FROM tasks WHERE workflow_id = ? ORDER BY created_at DESC'
      : 'SELECT * FROM tasks WHERE workflow_id = ? AND archived_at IS NULL ORDER BY created_at DESC'
    return db.prepare(sql).all(options.workflowId) as Task[]
  }
  if (options.includeArchived) {
    return db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all() as Task[]
  }
  return db
    .prepare('SELECT * FROM tasks WHERE archived_at IS NULL ORDER BY created_at DESC')
    .all() as Task[]
}

/**
 * Applies a partial update to a task and bumps `updated_at`.
 * Only keys present in `input` are changed; passing `null` explicitly sets
 * that field to NULL.
 *
 * @param db    Open better-sqlite3 database instance.
 * @param id    Task UUID.
 * @param input Fields to update.
 * @returns     The updated task row, or `undefined` if no task with that ID exists.
 */
export function updateTask(
  db: Database.Database,
  id: string,
  input: UpdateTaskInput,
): Task | undefined {
  const existing = getTaskById(db, id)
  if (!existing) return undefined

  const now = Math.floor(Date.now() / 1000)

  db.prepare(`
    UPDATE tasks
    SET title       = ?,
        description = ?,
        notes       = ?,
        status      = ?,
        priority    = ?,
        due_date    = ?,
        defer_date  = ?,
        review_date = ?,
        position_x  = ?,
        position_y  = ?,
        end_goal    = ?,
        workflow_id = ?,
        updated_at  = ?
    WHERE id = ?
  `).run(
    input.title ?? existing.title,
    'description' in input ? input.description : existing.description,
    'notes' in input ? input.notes : existing.notes,
    input.status ?? existing.status,
    input.priority ?? existing.priority,
    'due_date' in input ? input.due_date : existing.due_date,
    'defer_date' in input ? input.defer_date : existing.defer_date,
    'review_date' in input ? input.review_date : existing.review_date,
    'position_x' in input ? input.position_x : existing.position_x,
    'position_y' in input ? input.position_y : existing.position_y,
    'end_goal' in input ? input.end_goal : existing.end_goal,
    'workflow_id' in input ? input.workflow_id : existing.workflow_id,
    now,
    id,
  )

  return getTaskById(db, id)!
}

/**
 * Archives a task in a single transaction using two distinct batched operations:
 *
 *  1. Sets `archived_at` on the task row. The `tasks_fts_archive` trigger removes
 *     the entry from the FTS virtual table as a side-effect.
 *  2. Soft-deletes all active `task_dependencies` rows that reference this task
 *     as either `task_id` or `depends_on_task_id` — preserves the data for audit.
 *  3. Explicitly deletes the task from `tasks_fts` — the correct operation for
 *     FTS5 virtual tables, which do not cascade deletes via foreign keys.
 *
 * Calling this on an already-archived task is a no-op.
 *
 * @param db Open better-sqlite3 database instance.
 * @param id Task UUID to archive.
 */
export function archiveTask(db: Database.Database, id: string): void {
  const now = Math.floor(Date.now() / 1000)

  db.transaction(() => {
    // Capture rowid before the UPDATE for the explicit FTS delete in step 3.
    const row = db
      .prepare('SELECT rowid FROM tasks WHERE id = ? AND archived_at IS NULL')
      .get(id) as { rowid: number } | undefined

    if (!row) return // already archived or task does not exist

    // 1. Archive the task; tasks_fts_archive trigger fires and removes the FTS entry.
    db.prepare(
      'UPDATE tasks SET archived_at = ? WHERE id = ? AND archived_at IS NULL',
    ).run(now, id)

    // 2. Soft-delete all active dependencies involving this task (preserves data).
    db.prepare(`
      UPDATE task_dependencies
      SET    archived_at = ?
      WHERE  (task_id = ? OR depends_on_task_id = ?)
        AND  archived_at IS NULL
    `).run(now, id, id)

    // 3. Explicit FTS5 delete — correct for virtual tables; no-op if trigger
    //    already removed the entry, but harmless.
    db.prepare('DELETE FROM tasks_fts WHERE rowid = ?').run(row.rowid)
  })()
}

/**
 * Restores an archived task by clearing its `archived_at`.
 * The `tasks_fts_unarchive` trigger automatically re-indexes the task in the
 * FTS table.
 *
 * Note: dependencies are NOT automatically restored. Unarchive them individually
 * using `archiveDependency` and then re-create as needed.
 *
 * @param db Open better-sqlite3 database instance.
 * @param id Task UUID to restore.
 */
export function unarchiveTask(db: Database.Database, id: string): void {
  db.prepare('UPDATE tasks SET archived_at = NULL WHERE id = ?').run(id)
}

/**
 * Searches active (non-archived) tasks using the FTS5 full-text index.
 * Results are ordered by FTS5 relevance rank (best match first).
 *
 * The `query` parameter is passed directly to FTS5's MATCH operator.
 * Callers should sanitise user input to avoid FTS5 query syntax errors.
 *
 * @param db    Open better-sqlite3 database instance.
 * @param query FTS5 query string (e.g. `'project docs'` or `'auth*'`).
 * @returns     Matching active task rows.
 */
export function searchTasks(db: Database.Database, query: string): Task[] {
  return db
    .prepare(`
      SELECT t.*
      FROM tasks t
      JOIN (SELECT rowid, rank FROM tasks_fts WHERE tasks_fts MATCH ?) AS f
        ON t.rowid = f.rowid
      WHERE t.archived_at IS NULL
      ORDER BY f.rank
    `)
    .all(query) as Task[]
}
