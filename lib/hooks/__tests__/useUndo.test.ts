import Database from 'better-sqlite3'
import { resetDatabase } from '../../../tests/setup'
import {
  pushUndo,
  popUndo,
  executeUndoDep,
  executeUndoTaskComplete,
  STORAGE_KEY,
  type DepSnapshot,
  type TaskCompleteSnapshot,
} from '../useUndo'
import { createTask, getTaskById } from '../../db/repositories/taskRepository'
import {
  createDependency,
  getDependencyById,
  archiveDependency,
} from '../../db/repositories/taskDependencyRepository'

// ── localStorage mock ─────────────────────────────────────────────────────────
// Backed by a plain object so default implementations just work; individual
// tests can call .mockImplementationOnce() to inject errors.

const store: Record<string, string> = {}

const lsMock = {
  getItem: jest.fn((k: string): string | null => store[k] ?? null),
  setItem: jest.fn((k: string, v: string): void => { store[k] = v }),
  removeItem: jest.fn((k: string): void => { delete store[k] }),
  clear: jest.fn((): void => { Object.keys(store).forEach((k) => delete store[k]) }),
}

Object.defineProperty(global, 'localStorage', { value: lsMock, writable: true })

// ── DB setup ──────────────────────────────────────────────────────────────────

let db: Database.Database

beforeEach(() => {
  // Reset localStorage state
  Object.keys(store).forEach((k) => delete store[k])
  lsMock.getItem.mockReset().mockImplementation((k: string) => store[k] ?? null)
  lsMock.setItem.mockReset().mockImplementation((k: string, v: string) => { store[k] = v })
  lsMock.removeItem.mockReset().mockImplementation((k: string) => { delete store[k] })
  lsMock.clear.mockReset().mockImplementation(() => { Object.keys(store).forEach((k) => delete store[k]) })

  // Reset DB
  resetDatabase()
  db = new Database(process.env['DATABASE_URL']!)
  db.pragma('foreign_keys = ON')
})

afterEach(() => {
  db.close()
})

// ── helpers ───────────────────────────────────────────────────────────────────

const validDep: DepSnapshot = {
  type: 'dep',
  depId: 'dep-1',
  taskId: 'task-a',
  dependsOnTaskId: 'task-b',
}

// ── 1. localStorage try-catch: failure clears key ─────────────────────────────

it('clears the localStorage key when getItem throws (try-catch failure)', () => {
  lsMock.getItem.mockImplementationOnce(() => { throw new Error('storage unavailable') })

  pushUndo(validDep, jest.fn())

  expect(lsMock.removeItem).toHaveBeenCalledWith(STORAGE_KEY)
})

// ── 2. 100 KB size limit before push ─────────────────────────────────────────

it('shows UK English toast and skips push when snapshot serialises to over 100 KB', () => {
  const showToast = jest.fn()
  const oversized: DepSnapshot = {
    type: 'dep',
    depId: 'x'.repeat(102_400 + 1), // > 100 KB
    taskId: 'a',
    dependsOnTaskId: 'b',
  }

  pushUndo(oversized, showToast)

  expect(showToast).toHaveBeenCalledWith(
    'This action is too large to add to the undo history.',
  )
  expect(lsMock.setItem).not.toHaveBeenCalled()
})

// ── 3. Max 50 depth: oldest removed ──────────────────────────────────────────

it('removes the oldest entry before pushing when the stack has reached the 50-entry depth limit', () => {
  const noop = jest.fn()

  // Fill the stack to exactly 50 entries, each identifiable by its depId
  for (let i = 0; i < 50; i++) {
    pushUndo({ ...validDep, depId: `dep-${i}` }, noop)
  }

  // Push a 51st entry
  pushUndo({ ...validDep, depId: 'dep-50' }, noop)

  // Pop all entries: oldest (dep-0) must be gone; dep-50 must be present
  const popped: string[] = []
  let entry = popUndo()
  while (entry !== null) {
    popped.push((entry as DepSnapshot).depId)
    entry = popUndo()
  }

  expect(popped).toHaveLength(50)
  expect(popped).not.toContain('dep-0')   // oldest evicted
  expect(popped).toContain('dep-50')      // newest present
})

// ── 4. QuotaExceededError: remove oldest and retry once ──────────────────────

it('removes the oldest entry and retries setItem once when QuotaExceededError is thrown', () => {
  const noop = jest.fn()

  // Pre-fill with 2 entries so there is an "oldest" to evict
  pushUndo({ ...validDep, depId: 'old-1' }, noop)
  pushUndo({ ...validDep, depId: 'old-2' }, noop)

  // Reset call count after the pre-fill so we only count the quota-error push.
  lsMock.setItem.mockReset().mockImplementation((k: string, v: string) => { store[k] = v })

  // First setItem call throws QuotaExceededError; the retry succeeds.
  const quota = new Error('QuotaExceededError')
  quota.name = 'QuotaExceededError'
  lsMock.setItem.mockImplementationOnce(() => { throw quota })

  pushUndo({ ...validDep, depId: 'new-entry' }, noop)

  // Exactly two setItem calls: the throw and the successful retry.
  expect(lsMock.setItem).toHaveBeenCalledTimes(2)

  // Stack should contain old-2 and new-entry; old-1 was evicted
  const popped: string[] = []
  let entry = popUndo()
  while (entry !== null) {
    popped.push((entry as DepSnapshot).depId)
    entry = popUndo()
  }
  expect(popped).not.toContain('old-1')
  expect(popped).toContain('old-2')
  expect(popped).toContain('new-entry')
})

// ── 5. 24h expiry ─────────────────────────────────────────────────────────────

it('returns null and discards entries older than 24 hours', () => {
  const realDateNow = Date.now.bind(Date)
  const dateSpy = jest.spyOn(Date, 'now')

  // Push at t=0
  dateSpy.mockReturnValue(0)
  pushUndo(validDep, jest.fn())

  // Pop at t = 24h + 1ms (expired)
  dateSpy.mockReturnValue(24 * 60 * 60 * 1000 + 1)
  const result = popUndo()

  dateSpy.mockRestore()
  void realDateNow // keep lint happy

  expect(result).toBeNull()
})

// ── 6 & 7. Undo conflict check (dep) ─────────────────────────────────────────

describe('executeUndoDep — conflict check', () => {
  it('runs SELECT with archived_at IS NULL before UPDATE in the non-conflict path, then restores the dep', () => {
    const prereq = createTask(db, { title: 'Prereq' })
    const dependent = createTask(db, { title: 'Dependent' })
    const dep = createDependency(db, { task_id: dependent.id, depends_on_task_id: prereq.id })
    archiveDependency(db, dep.id)

    const prepareSpy = jest.spyOn(db, 'prepare')

    executeUndoDep(
      db,
      { type: 'dep', depId: dep.id, taskId: dependent.id, dependsOnTaskId: prereq.id },
      jest.fn(),
    )

    const sqls = prepareSpy.mock.calls.map(([sql]) => (sql as string).replace(/\s+/g, ' ').toUpperCase())
    const selectIdx = sqls.findIndex((s) => s.startsWith('SELECT'))
    const updateIdx = sqls.findIndex((s) => s.startsWith('UPDATE'))

    expect(selectIdx).toBeGreaterThanOrEqual(0)          // SELECT was issued
    expect(updateIdx).toBeGreaterThan(selectIdx)         // UPDATE came after SELECT
    expect(sqls[selectIdx]).toMatch(/ARCHIVED_AT IS NULL/) // uses the right filter

    // Dep is restored
    expect(getDependencyById(db, dep.id)?.archived_at).toBeNull()

    prepareSpy.mockRestore()
  })

  it('discards the snapshot with UK English toast and never calls UPDATE when an active dep already exists', () => {
    const prereq = createTask(db, { title: 'Prereq' })
    const dependent = createTask(db, { title: 'Dependent' })

    // Archive the original dep (simulates prior deletion)
    const archivedDep = createDependency(db, { task_id: dependent.id, depends_on_task_id: prereq.id })
    archiveDependency(db, archivedDep.id)

    // A new active dep with the same pair now exists (created by someone else)
    createDependency(db, { task_id: dependent.id, depends_on_task_id: prereq.id })

    const showToast = jest.fn()
    const prepareSpy = jest.spyOn(db, 'prepare')

    executeUndoDep(
      db,
      { type: 'dep', depId: archivedDep.id, taskId: dependent.id, dependsOnTaskId: prereq.id },
      showToast,
    )

    const sqls = prepareSpy.mock.calls.map(([sql]) => (sql as string).trim().toUpperCase())
    const selectIdx = sqls.findIndex((s) => s.startsWith('SELECT'))
    const updateIdx = sqls.findIndex((s) => s.startsWith('UPDATE'))

    expect(selectIdx).toBeGreaterThanOrEqual(0) // SELECT was called
    expect(updateIdx).toBe(-1)                  // UPDATE was never called

    expect(showToast).toHaveBeenCalledWith(
      'Undo not available — this dependency already exists.',
    )

    // Original dep still archived
    expect(getDependencyById(db, archivedDep.id)?.archived_at).not.toBeNull()

    prepareSpy.mockRestore()
  })
})

// ── 8. Complete-task undo: revert all downstream tasks ────────────────────────

it('reverts the completed task and all downstream tasks to their previous statuses', () => {
  const a = createTask(db, { title: 'A', status: 'done' })
  const b = createTask(db, { title: 'B', status: 'done' })
  const c = createTask(db, { title: 'C', status: 'done' })

  const snapshot: TaskCompleteSnapshot = {
    type: 'task-complete',
    taskId: a.id,
    previousStatus: 'todo',
    downstreamChanges: [
      { taskId: b.id, previousStatus: 'todo' },
      { taskId: c.id, previousStatus: 'blocked' },
    ],
  }

  executeUndoTaskComplete(db, snapshot, jest.fn())

  expect(getTaskById(db, a.id)?.status).toBe('todo')
  expect(getTaskById(db, b.id)?.status).toBe('todo')
  expect(getTaskById(db, c.id)?.status).toBe('blocked')
})

// ── 9. Delete-dependency undo: set archived_at to NULL ────────────────────────

it('sets archived_at to NULL on the dep row when undoing a deleted dependency', () => {
  const prereq = createTask(db, { title: 'Prereq' })
  const dependent = createTask(db, { title: 'Dependent' })
  const dep = createDependency(db, { task_id: dependent.id, depends_on_task_id: prereq.id })

  archiveDependency(db, dep.id)
  expect(getDependencyById(db, dep.id)?.archived_at).not.toBeNull()

  executeUndoDep(
    db,
    { type: 'dep', depId: dep.id, taskId: dependent.id, dependsOnTaskId: prereq.id },
    jest.fn(),
  )

  expect(getDependencyById(db, dep.id)?.archived_at).toBeNull()
})
