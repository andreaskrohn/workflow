import Database from 'better-sqlite3'
import { resetDatabase } from '../../../../tests/setup'
import {
  createTask,
  getTaskById,
  listTasks,
  updateTask,
  archiveTask,
  unarchiveTask,
  searchTasks,
} from '../taskRepository'
import { createDependency } from '../taskDependencyRepository'

let db: Database.Database

beforeEach(() => {
  resetDatabase()
  db = new Database(process.env['DATABASE_URL']!)
  db.pragma('foreign_keys = ON')
})

afterEach(() => {
  db.close()
})

// ── createTask ────────────────────────────────────────────────────────────────

describe('createTask', () => {
  it('creates a task with required fields and sensible defaults', () => {
    const task = createTask(db, { title: 'Write docs' })
    expect(task.id).toBeTruthy()
    expect(task.title).toBe('Write docs')
    expect(task.status).toBe('todo')
    expect(task.priority).toBe(3)
    expect(task.archived_at).toBeNull()
    expect(task.created_at).toBeGreaterThan(0)
    expect(task.updated_at).toBeGreaterThan(0)
  })

  it('uses a caller-supplied ID', () => {
    const task = createTask(db, { id: 'explicit-id', title: 'Named' })
    expect(task.id).toBe('explicit-id')
  })

  it('stores optional fields', () => {
    const task = createTask(db, {
      title: 'Full task',
      description: 'Some details',
      notes: 'A note',
      status: 'done',
      priority: 5,
      due_date: 1700000000,
    })
    expect(task.description).toBe('Some details')
    expect(task.notes).toBe('A note')
    expect(task.status).toBe('done')
    expect(task.priority).toBe(5)
    expect(task.due_date).toBe(1700000000)
  })

  it('indexes the task in the FTS table via trigger', () => {
    createTask(db, { title: 'UniqueFtsToken' })
    const row = db
      .prepare("SELECT rowid FROM tasks_fts WHERE tasks_fts MATCH 'UniqueFtsToken'")
      .get()
    expect(row).toBeDefined()
  })
})

// ── getTaskById ───────────────────────────────────────────────────────────────

describe('getTaskById', () => {
  it('returns the task when found', () => {
    const created = createTask(db, { title: 'Find me' })
    const found = getTaskById(db, created.id)
    expect(found?.id).toBe(created.id)
  })

  it('returns undefined for an unknown ID', () => {
    expect(getTaskById(db, 'no-such-id')).toBeUndefined()
  })

  it('returns archived tasks (no archived filter on ID lookup)', () => {
    const task = createTask(db, { title: 'To be archived' })
    archiveTask(db, task.id)
    const found = getTaskById(db, task.id)
    expect(found?.archived_at).not.toBeNull()
  })
})

// ── listTasks ─────────────────────────────────────────────────────────────────

describe('listTasks', () => {
  it('returns only active tasks by default', () => {
    const active = createTask(db, { title: 'Active' })
    const archived = createTask(db, { title: 'Archived' })
    archiveTask(db, archived.id)

    const result = listTasks(db)
    const ids = result.map((t) => t.id)
    expect(ids).toContain(active.id)
    expect(ids).not.toContain(archived.id)
  })

  it('includes archived tasks when includeArchived is true', () => {
    const active = createTask(db, { title: 'Active' })
    const archived = createTask(db, { title: 'Archived' })
    archiveTask(db, archived.id)

    const result = listTasks(db, { includeArchived: true })
    const ids = result.map((t) => t.id)
    expect(ids).toContain(active.id)
    expect(ids).toContain(archived.id)
  })

  it('returns an empty array when no tasks exist', () => {
    expect(listTasks(db)).toEqual([])
  })
})

// ── updateTask ────────────────────────────────────────────────────────────────

describe('updateTask', () => {
  it('updates the specified fields', () => {
    const task = createTask(db, { title: 'Original', status: 'todo', priority: 1 })
    const updated = updateTask(db, task.id, { title: 'Revised', status: 'done', priority: 5 })
    expect(updated?.title).toBe('Revised')
    expect(updated?.status).toBe('done')
    expect(updated?.priority).toBe(5)
  })

  it('leaves unspecified fields unchanged', () => {
    const task = createTask(db, { title: 'Original', description: 'Keep this' })
    const updated = updateTask(db, task.id, { title: 'Changed' })
    expect(updated?.description).toBe('Keep this')
  })

  it('can set a nullable field to null explicitly', () => {
    const task = createTask(db, { title: 'T', description: 'Will be removed' })
    const updated = updateTask(db, task.id, { description: null })
    expect(updated?.description).toBeNull()
  })

  it('bumps updated_at', () => {
    const task = createTask(db, { title: 'T' })
    // Ensure at least 1 second passes so the timestamp changes
    const before = task.updated_at
    // Mock time by setting updated_at manually via raw SQL, then calling updateTask
    db.prepare('UPDATE tasks SET updated_at = ? WHERE id = ?').run(before - 5, task.id)
    const updated = updateTask(db, task.id, { title: 'New' })
    expect(updated!.updated_at).toBeGreaterThan(before - 5)
  })

  it('returns undefined for a non-existent ID', () => {
    expect(updateTask(db, 'ghost', { title: 'X' })).toBeUndefined()
  })
})

// ── archiveTask ───────────────────────────────────────────────────────────────

describe('archiveTask', () => {
  it('sets archived_at on the task', () => {
    const task = createTask(db, { title: 'Archive me' })
    archiveTask(db, task.id)
    const found = getTaskById(db, task.id)
    expect(found?.archived_at).not.toBeNull()
  })

  it('soft-deletes active dependencies where this task is the dependent', () => {
    const dep = createTask(db, { title: 'Dep' })
    const main = createTask(db, { title: 'Main' })
    const edge = createDependency(db, { task_id: main.id, depends_on_task_id: dep.id })

    archiveTask(db, main.id)

    const row = db
      .prepare('SELECT * FROM task_dependencies WHERE id = ?')
      .get(edge.id) as { archived_at: number | null }
    expect(row.archived_at).not.toBeNull()
  })

  it('soft-deletes active dependencies where this task is the dependency target', () => {
    const dep = createTask(db, { title: 'Dep' })
    const main = createTask(db, { title: 'Main' })
    const edge = createDependency(db, { task_id: main.id, depends_on_task_id: dep.id })

    archiveTask(db, dep.id)

    const row = db
      .prepare('SELECT * FROM task_dependencies WHERE id = ?')
      .get(edge.id) as { archived_at: number | null }
    expect(row.archived_at).not.toBeNull()
  })

  it('removes the task from the FTS index', () => {
    createTask(db, { title: 'ArchiveFtsCheck' })
    const task = createTask(db, { title: 'ArchiveFtsCheck' }) // second with same token
    archiveTask(db, task.id)

    // Only one FTS entry should remain (the other task, still active)
    const rows = db
      .prepare("SELECT rowid FROM tasks_fts WHERE tasks_fts MATCH 'ArchiveFtsCheck'")
      .all()
    expect(rows.length).toBe(1)
  })

  it('is a no-op when the task is already archived', () => {
    const task = createTask(db, { title: 'Double archive' })
    archiveTask(db, task.id)
    const firstArchivedAt = getTaskById(db, task.id)!.archived_at

    archiveTask(db, task.id)
    const secondArchivedAt = getTaskById(db, task.id)!.archived_at

    expect(secondArchivedAt).toBe(firstArchivedAt)
  })

  it('does not archive already-archived dependencies again', () => {
    const dep = createTask(db, { title: 'Dep' })
    const main = createTask(db, { title: 'Main' })
    const edge = createDependency(db, { task_id: main.id, depends_on_task_id: dep.id })

    // Manually archive the dependency first
    const originalTs = 1000000000
    db.prepare('UPDATE task_dependencies SET archived_at = ? WHERE id = ?').run(
      originalTs,
      edge.id,
    )

    archiveTask(db, main.id)

    // archived_at should remain the original value, not overwritten
    const row = db
      .prepare('SELECT archived_at FROM task_dependencies WHERE id = ?')
      .get(edge.id) as { archived_at: number }
    expect(row.archived_at).toBe(originalTs)
  })
})

// ── unarchiveTask ─────────────────────────────────────────────────────────────

describe('unarchiveTask', () => {
  it('clears archived_at', () => {
    const task = createTask(db, { title: 'Restore' })
    archiveTask(db, task.id)
    unarchiveTask(db, task.id)
    expect(getTaskById(db, task.id)?.archived_at).toBeNull()
  })

  it('re-indexes the task in the FTS table via the unarchive trigger', () => {
    createTask(db, { title: 'UnarchiveFtsToken' })
    const task = createTask(db, { title: 'UnarchiveFtsToken' })
    archiveTask(db, task.id)

    // One entry remains after archive
    const before = db
      .prepare("SELECT rowid FROM tasks_fts WHERE tasks_fts MATCH 'UnarchiveFtsToken'")
      .all()
    expect(before.length).toBe(1)

    unarchiveTask(db, task.id)

    // Both entries should be present after restore
    const after = db
      .prepare("SELECT rowid FROM tasks_fts WHERE tasks_fts MATCH 'UnarchiveFtsToken'")
      .all()
    expect(after.length).toBe(2)
  })
})

// ── searchTasks ───────────────────────────────────────────────────────────────

describe('searchTasks', () => {
  it('returns tasks matching the query', () => {
    const task = createTask(db, { title: 'Zephyr documentation' })
    const results = searchTasks(db, 'Zephyr')
    expect(results.find((t) => t.id === task.id)).toBeDefined()
  })

  it('does not return tasks that do not match', () => {
    createTask(db, { title: 'Completely unrelated' })
    const results = searchTasks(db, 'Zephyr')
    expect(results.length).toBe(0)
  })

  it('does not return archived tasks', () => {
    const task = createTask(db, { title: 'ZephyrArchived' })
    archiveTask(db, task.id)
    const results = searchTasks(db, 'ZephyrArchived')
    expect(results.find((t) => t.id === task.id)).toBeUndefined()
  })

  it('searches across description and notes fields', () => {
    const task = createTask(db, {
      title: 'Plain title',
      description: 'XylophoneTermDescription',
    })
    const results = searchTasks(db, 'XylophoneTermDescription')
    expect(results.find((t) => t.id === task.id)).toBeDefined()
  })
})
