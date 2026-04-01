import Database from 'better-sqlite3'
import { resetDatabase } from '../../../../tests/setup'
import {
  createDependency,
  getDependencyById,
  getDependenciesForTask,
  getDependentsForTask,
  archiveDependency,
} from '../taskDependencyRepository'
import { createTask, archiveTask } from '../taskRepository'

let db: Database.Database

beforeEach(() => {
  resetDatabase()
  db = new Database(process.env['DATABASE_URL']!)
  db.pragma('foreign_keys = ON')
})

afterEach(() => {
  db.close()
})

// ── helpers ───────────────────────────────────────────────────────────────────

function makeTask(title: string) {
  return createTask(db, { title })
}

// ── createDependency ──────────────────────────────────────────────────────────

describe('createDependency', () => {
  it('creates a dependency between two tasks', () => {
    const a = makeTask('A')
    const b = makeTask('B')
    const dep = createDependency(db, { task_id: b.id, depends_on_task_id: a.id })

    expect(dep.id).toBeTruthy()
    expect(dep.task_id).toBe(b.id)
    expect(dep.depends_on_task_id).toBe(a.id)
    expect(dep.archived_at).toBeNull()
    expect(dep.created_at).toBeGreaterThan(0)
  })

  it('uses a caller-supplied ID', () => {
    const a = makeTask('A')
    const b = makeTask('B')
    const dep = createDependency(db, { id: 'fixed-dep-id', task_id: b.id, depends_on_task_id: a.id })
    expect(dep.id).toBe('fixed-dep-id')
  })

  it('throws on duplicate active dependency (partial unique index)', () => {
    const a = makeTask('A')
    const b = makeTask('B')
    createDependency(db, { task_id: b.id, depends_on_task_id: a.id })

    expect(() => {
      createDependency(db, { task_id: b.id, depends_on_task_id: a.id })
    }).toThrow()
  })

  it('allows a new dependency after the original is archived', () => {
    const a = makeTask('A')
    const b = makeTask('B')
    const first = createDependency(db, { task_id: b.id, depends_on_task_id: a.id })
    archiveDependency(db, first.id)

    const second = createDependency(db, { task_id: b.id, depends_on_task_id: a.id })
    expect(second.id).not.toBe(first.id)
    expect(second.archived_at).toBeNull()
  })
})

// ── getDependencyById ─────────────────────────────────────────────────────────

describe('getDependencyById', () => {
  it('returns the dependency when found', () => {
    const a = makeTask('A')
    const b = makeTask('B')
    const dep = createDependency(db, { task_id: b.id, depends_on_task_id: a.id })

    expect(getDependencyById(db, dep.id)?.id).toBe(dep.id)
  })

  it('returns undefined for an unknown ID', () => {
    expect(getDependencyById(db, 'no-such-dep')).toBeUndefined()
  })

  it('returns archived dependencies (no archive filter on ID lookup)', () => {
    const a = makeTask('A')
    const b = makeTask('B')
    const dep = createDependency(db, { task_id: b.id, depends_on_task_id: a.id })
    archiveDependency(db, dep.id)

    expect(getDependencyById(db, dep.id)?.archived_at).not.toBeNull()
  })
})

// ── getDependenciesForTask ────────────────────────────────────────────────────

describe('getDependenciesForTask', () => {
  it('returns active dependencies for a task', () => {
    const a = makeTask('A')
    const b = makeTask('B')
    const c = makeTask('C')
    createDependency(db, { task_id: c.id, depends_on_task_id: a.id })
    createDependency(db, { task_id: c.id, depends_on_task_id: b.id })

    const deps = getDependenciesForTask(db, c.id)
    expect(deps.length).toBe(2)
    expect(deps.every((d) => d.task_id === c.id)).toBe(true)
  })

  it('excludes archived dependencies', () => {
    const a = makeTask('A')
    const b = makeTask('B')
    const dep = createDependency(db, { task_id: b.id, depends_on_task_id: a.id })
    archiveDependency(db, dep.id)

    expect(getDependenciesForTask(db, b.id)).toHaveLength(0)
  })

  it('returns empty array when task has no dependencies', () => {
    const a = makeTask('A')
    expect(getDependenciesForTask(db, a.id)).toEqual([])
  })
})

// ── getDependentsForTask ──────────────────────────────────────────────────────

describe('getDependentsForTask', () => {
  it('returns active dependents for a task', () => {
    const a = makeTask('A')
    const b = makeTask('B')
    const c = makeTask('C')
    createDependency(db, { task_id: b.id, depends_on_task_id: a.id })
    createDependency(db, { task_id: c.id, depends_on_task_id: a.id })

    const dependents = getDependentsForTask(db, a.id)
    expect(dependents.length).toBe(2)
    expect(dependents.every((d) => d.depends_on_task_id === a.id)).toBe(true)
  })

  it('excludes archived dependents', () => {
    const a = makeTask('A')
    const b = makeTask('B')
    const dep = createDependency(db, { task_id: b.id, depends_on_task_id: a.id })
    archiveDependency(db, dep.id)

    expect(getDependentsForTask(db, a.id)).toHaveLength(0)
  })

  it('returns empty array when no tasks depend on this task', () => {
    const a = makeTask('A')
    expect(getDependentsForTask(db, a.id)).toEqual([])
  })
})

// ── archiveDependency ─────────────────────────────────────────────────────────

describe('archiveDependency', () => {
  it('sets archived_at on the dependency', () => {
    const a = makeTask('A')
    const b = makeTask('B')
    const dep = createDependency(db, { task_id: b.id, depends_on_task_id: a.id })

    archiveDependency(db, dep.id)

    expect(getDependencyById(db, dep.id)?.archived_at).not.toBeNull()
  })

  it('does not overwrite archived_at if already archived', () => {
    const a = makeTask('A')
    const b = makeTask('B')
    const dep = createDependency(db, { task_id: b.id, depends_on_task_id: a.id })
    archiveDependency(db, dep.id)

    const first = getDependencyById(db, dep.id)!.archived_at

    archiveDependency(db, dep.id)
    const second = getDependencyById(db, dep.id)!.archived_at

    expect(second).toBe(first)
  })

  it('only archives the targeted dependency, not others for the same task', () => {
    const a = makeTask('A')
    const b = makeTask('B')
    const c = makeTask('C')
    const dep1 = createDependency(db, { task_id: c.id, depends_on_task_id: a.id })
    const dep2 = createDependency(db, { task_id: c.id, depends_on_task_id: b.id })

    archiveDependency(db, dep1.id)

    expect(getDependencyById(db, dep1.id)?.archived_at).not.toBeNull()
    expect(getDependencyById(db, dep2.id)?.archived_at).toBeNull()
  })
})

// ── archiveTask integration ───────────────────────────────────────────────────

describe('archiveTask cascades to dependencies', () => {
  it('soft-deletes all active edges when a task is archived', () => {
    const a = makeTask('A')
    const b = makeTask('B')
    const c = makeTask('C')
    // b depends on a, c depends on a
    const e1 = createDependency(db, { task_id: b.id, depends_on_task_id: a.id })
    const e2 = createDependency(db, { task_id: c.id, depends_on_task_id: a.id })

    archiveTask(db, a.id)

    expect(getDependencyById(db, e1.id)?.archived_at).not.toBeNull()
    expect(getDependencyById(db, e2.id)?.archived_at).not.toBeNull()
    // b and c themselves are still active
    expect(getDependenciesForTask(db, b.id)).toHaveLength(0)
    expect(getDependenciesForTask(db, c.id)).toHaveLength(0)
  })
})
