import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TaskDependency {
  id: string
  /** The task that has the dependency — i.e. the task that must wait. */
  task_id: string
  /** The task being depended upon — i.e. the prerequisite. */
  depends_on_task_id: string
  created_at: number
  archived_at: number | null
}

export interface CreateDependencyInput {
  /** Optional UUID — generated if omitted. */
  id?: string
  task_id: string
  depends_on_task_id: string
}

// ── Functions ─────────────────────────────────────────────────────────────────

/**
 * Creates a new task dependency (`task_id` depends on `depends_on_task_id`).
 *
 * Throws a UNIQUE constraint error if an active (non-archived) dependency
 * between the same pair already exists — enforced by the partial unique index
 * `task_deps_unique_active WHERE archived_at IS NULL`.
 *
 * @param db    Open better-sqlite3 database instance.
 * @param input Dependency fields. `id` is optional; a UUID is generated if omitted.
 * @returns     The newly created dependency row.
 */
export function createDependency(
  db: Database.Database,
  input: CreateDependencyInput,
): TaskDependency {
  const id = input.id ?? randomUUID()
  const now = Math.floor(Date.now() / 1000)

  db.prepare(`
    INSERT INTO task_dependencies (id, task_id, depends_on_task_id, created_at)
    VALUES (?, ?, ?, ?)
  `).run(id, input.task_id, input.depends_on_task_id, now)

  return getDependencyById(db, id)!
}

/**
 * Returns a single dependency row by ID regardless of its archived state.
 *
 * @param db Open better-sqlite3 database instance.
 * @param id Dependency UUID.
 * @returns  The dependency row, or `undefined` if not found.
 */
export function getDependencyById(
  db: Database.Database,
  id: string,
): TaskDependency | undefined {
  return db
    .prepare('SELECT * FROM task_dependencies WHERE id = ?')
    .get(id) as TaskDependency | undefined
}

/**
 * Returns the active dependencies of a task — the tasks that `taskId` must
 * wait on. Archived dependencies are excluded.
 *
 * @param db     Open better-sqlite3 database instance.
 * @param taskId UUID of the task whose prerequisites to fetch.
 * @returns      Active dependency rows where `task_id = taskId`.
 */
export function getDependenciesForTask(
  db: Database.Database,
  taskId: string,
): TaskDependency[] {
  return db
    .prepare(`
      SELECT * FROM task_dependencies
      WHERE  task_id = ?
        AND  archived_at IS NULL
    `)
    .all(taskId) as TaskDependency[]
}

/**
 * Returns the active dependents of a task — tasks that are blocked on `taskId`.
 * Archived dependencies are excluded.
 *
 * @param db     Open better-sqlite3 database instance.
 * @param taskId UUID of the prerequisite task.
 * @returns      Active dependency rows where `depends_on_task_id = taskId`.
 */
export function getDependentsForTask(
  db: Database.Database,
  taskId: string,
): TaskDependency[] {
  return db
    .prepare(`
      SELECT * FROM task_dependencies
      WHERE  depends_on_task_id = ?
        AND  archived_at IS NULL
    `)
    .all(taskId) as TaskDependency[]
}

/**
 * Soft-deletes a dependency by setting its `archived_at` timestamp.
 * The row is preserved for audit purposes.
 *
 * Once archived, the partial unique index (`WHERE archived_at IS NULL`) no
 * longer considers this dependency active, so a new dependency between the
 * same two tasks can be created immediately.
 *
 * Calling this on an already-archived dependency is a no-op.
 *
 * @param db Open better-sqlite3 database instance.
 * @param id Dependency UUID to archive.
 */
export function archiveDependency(db: Database.Database, id: string): void {
  const now = Math.floor(Date.now() / 1000)
  db.prepare(
    'UPDATE task_dependencies SET archived_at = ? WHERE id = ? AND archived_at IS NULL',
  ).run(now, id)
}
