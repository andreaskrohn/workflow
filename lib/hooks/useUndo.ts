/**
 * Undo stack utilities.
 *
 * Client-side half  — pushUndo / popUndo manage a persisted stack in
 *                     localStorage with size, depth, and expiry constraints.
 * Server-side half  — executeUndoDep / executeUndoTaskComplete apply undo
 *                     operations directly to the database with conflict guards.
 */
import type Database from 'better-sqlite3'

// ── Types ─────────────────────────────────────────────────────────────────────

export type TaskStatus = 'todo' | 'done' | 'blocked'

/** Snapshot created when a dependency edge is deleted. */
export interface DepSnapshot {
  type: 'dep'
  /** ID of the archived task_dependencies row to restore. */
  depId: string
  /** task_id of the dependency (the waiting/downstream task). */
  taskId: string
  /** depends_on_task_id (the prerequisite task). */
  dependsOnTaskId: string
}

/**
 * Snapshot created when a task is marked as done.
 * Stores the previous statuses of the completed task and any downstream tasks
 * whose statuses should also be reverted on undo.
 */
export interface TaskCompleteSnapshot {
  type: 'task-complete'
  taskId: string
  previousStatus: TaskStatus
  downstreamChanges: Array<{ taskId: string; previousStatus: TaskStatus }>
}

export type UndoSnapshot = DepSnapshot | TaskCompleteSnapshot

interface StoredEntry {
  snapshot: UndoSnapshot
  /** Date.now() value at push time — used for 24 h expiry. */
  pushedAt: number
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const STORAGE_KEY = 'workflow_undo_stack'
const MAX_DEPTH = 50
const MAX_BYTES = 100 * 1024           // 100 KB
const EXPIRY_MS = 24 * 60 * 60 * 1000 // 24 hours

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * Reads and parses the stack from localStorage.
 * On any read error the key is cleared and an empty stack is returned.
 * Expired entries (> 24 h) are filtered out transparently.
 */
function loadStack(): StoredEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const entries = JSON.parse(raw) as StoredEntry[]
    const now = Date.now()
    return entries.filter((e) => now - e.pushedAt < EXPIRY_MS)
  } catch {
    // Corrupted or unavailable storage — clear the key and start fresh.
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore secondary failure */ }
    return []
  }
}

/**
 * Persists the stack to localStorage.
 *
 * On QuotaExceededError the oldest entry is dropped and the write is retried
 * once. Any other error (or a second QuotaExceededError) clears the key.
 */
function saveStack(stack: StoredEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stack))
  } catch (err) {
    if (err instanceof Error && err.name === 'QuotaExceededError') {
      // Evict the oldest entry and retry once.
      const trimmed = stack.slice(1)
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
      } catch {
        try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
      }
    } else {
      try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
    }
  }
}

// ── Public: client-side stack management ─────────────────────────────────────

/**
 * Serialises `snapshot` and pushes it onto the persistent undo stack.
 *
 * Rules enforced before writing:
 *  - Snapshots larger than 100 KB are rejected with a toast; nothing is written.
 *  - The stack is capped at 50 entries; the oldest entry is evicted if needed.
 *  - QuotaExceededError evicts the oldest entry and retries the write once.
 *
 * @param snapshot  The undo state to store.
 * @param showToast Called with a user-facing message when the push is refused.
 */
export function pushUndo(
  snapshot: UndoSnapshot,
  showToast: (message: string) => void,
): void {
  if (JSON.stringify(snapshot).length > MAX_BYTES) {
    showToast('This action is too large to add to the undo history.')
    return
  }

  const stack = loadStack()
  stack.push({ snapshot, pushedAt: Date.now() })

  // Enforce max depth — remove from the front (oldest entries first).
  while (stack.length > MAX_DEPTH) {
    stack.shift()
  }

  saveStack(stack)
}

/**
 * Removes and returns the most-recently pushed (non-expired) snapshot, or
 * `null` when the stack is empty.
 */
export function popUndo(): UndoSnapshot | null {
  const stack = loadStack()
  if (stack.length === 0) return null
  const entry = stack.pop()!
  saveStack(stack)
  return entry.snapshot
}

// ── Public: server-side undo execution ───────────────────────────────────────

/**
 * Undoes a deleted dependency by restoring its archived row.
 *
 * A SELECT is executed first to verify no active dependency with the same
 * (task_id, depends_on_task_id) pair already exists. If one is found the
 * snapshot is silently discarded and the user is informed via toast — calling
 * UPDATE without this guard would crash on the partial unique index
 * (task_deps_unique_active WHERE archived_at IS NULL).
 *
 * @param db        Open better-sqlite3 database instance.
 * @param snapshot  The dep snapshot to restore.
 * @param showToast Called when the undo cannot proceed due to a conflict.
 */
export function executeUndoDep(
  db: Database.Database,
  snapshot: DepSnapshot,
  showToast: (message: string) => void,
): void {
  // Conflict guard: SELECT before any UPDATE.
  const existing = db
    .prepare(
      `SELECT id
       FROM   task_dependencies
       WHERE  task_id            = ?
         AND  depends_on_task_id = ?
         AND  archived_at        IS NULL`,
    )
    .get(snapshot.taskId, snapshot.dependsOnTaskId)

  if (existing) {
    showToast('Undo not available — this dependency already exists.')
    return
  }

  // Safe to restore: set archived_at back to NULL.
  db.prepare(
    'UPDATE task_dependencies SET archived_at = NULL WHERE id = ?',
  ).run(snapshot.depId)
}

/**
 * Undoes marking a task as done by restoring the previous status of the task
 * and all downstream tasks captured in the snapshot.
 *
 * @param db        Open better-sqlite3 database instance.
 * @param snapshot  The task-complete snapshot to revert.
 * @param showToast Reserved for future error reporting.
 */
export function executeUndoTaskComplete(
  db: Database.Database,
  snapshot: TaskCompleteSnapshot,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  showToast: (message: string) => void,
): void {
  db.transaction(() => {
    db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(
      snapshot.previousStatus,
      snapshot.taskId,
    )
    for (const { taskId, previousStatus } of snapshot.downstreamChanges) {
      db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(previousStatus, taskId)
    }
  })()
}
