import Database from 'better-sqlite3'
import { resetDatabase } from '../../../tests/setup'
import { buildAncestorMap } from '../graphTraversal'
import { ApiError } from '../../utils/errors'
import { createTask } from '../../db/repositories/taskRepository'
import { createDependency } from '../../db/repositories/taskDependencyRepository'

// Default workflow seeded by migration 0005
const WORKFLOW_ID = '00000000-0000-0000-0000-000000000003'

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
  return createTask(db, { workflow_id: WORKFLOW_ID, title })
}

function makeDep(taskId: string, dependsOnId: string) {
  return createDependency(db, { task_id: taskId, depends_on_task_id: dependsOnId })
}

// ── 1. Single DB query with archived_at IS NULL ───────────────────────────────

it('loads the full active edge list in a single DB query filtered by archived_at IS NULL', () => {
  const a = makeTask('A')
  const b = makeTask('B')
  makeDep(b.id, a.id)

  const spy = jest.spyOn(db, 'prepare')
  buildAncestorMap(db, WORKFLOW_ID)

  expect(spy).toHaveBeenCalledTimes(1)
  expect(spy.mock.calls[0]![0]).toMatch(/archived_at\s+IS\s+NULL/i)
  spy.mockRestore()
})

// ── 2. No further DB queries inside the BFS loop ──────────────────────────────

it('makes exactly one DB query regardless of graph size — none inside the BFS loop', () => {
  // 15-node chain → 15 BFS iterations; query count must remain 1
  const tasks = Array.from({ length: 15 }, (_, i) => makeTask(`T${i}`))
  for (let i = 1; i < 15; i++) {
    makeDep(tasks[i]!.id, tasks[i - 1]!.id)
  }

  const spy = jest.spyOn(db, 'prepare')
  buildAncestorMap(db, WORKFLOW_ID)

  expect(spy).toHaveBeenCalledTimes(1)
  spy.mockRestore()
})

// ── 3. Correct ancestor sets — linear chain ───────────────────────────────────

it('returns correct transitive ancestor sets for a linear chain A → B → C', () => {
  const a = makeTask('A')
  const b = makeTask('B')
  const c = makeTask('C')
  makeDep(b.id, a.id) // B depends on A
  makeDep(c.id, b.id) // C depends on B

  const map = buildAncestorMap(db, WORKFLOW_ID)

  expect(map.get(a.id)).toEqual(new Set())
  expect(map.get(b.id)).toEqual(new Set([a.id]))
  expect(map.get(c.id)).toEqual(new Set([a.id, b.id]))
})

// ── 4. Correct ancestor sets — diamond graph ──────────────────────────────────

it('returns correct transitive ancestor sets for a diamond graph (A → B, A → C, B → D, C → D)', () => {
  const a = makeTask('A')
  const b = makeTask('B')
  const c = makeTask('C')
  const d = makeTask('D')
  makeDep(b.id, a.id) // B depends on A
  makeDep(c.id, a.id) // C depends on A
  makeDep(d.id, b.id) // D depends on B
  makeDep(d.id, c.id) // D depends on C

  const map = buildAncestorMap(db, WORKFLOW_ID)

  expect(map.get(a.id)).toEqual(new Set())
  expect(map.get(b.id)).toEqual(new Set([a.id]))
  expect(map.get(c.id)).toEqual(new Set([a.id]))
  expect(map.get(d.id)).toEqual(new Set([a.id, b.id, c.id]))
})

// ── 5. Timeout — ApiError HTTP 500 with exact message ────────────────────────

it('throws ApiError HTTP 500 with the complexity message when the 100 ms deadline is exceeded', () => {
  // 15-node chain gives 15 BFS iterations; the check fires at iteration 10
  const tasks = Array.from({ length: 15 }, (_, i) => makeTask(`Task${i}`))
  for (let i = 1; i < 15; i++) {
    makeDep(tasks[i]!.id, tasks[i - 1]!.id)
  }

  // First call: startTime = 0.  Second call (iteration 10): 200 ms → exceeds 100 ms limit.
  const dateSpy = jest.spyOn(Date, 'now')
    .mockReturnValueOnce(0)
    .mockReturnValue(200)

  let thrown: unknown
  try {
    buildAncestorMap(db, WORKFLOW_ID)
  } catch (e) {
    thrown = e
  } finally {
    dateSpy.mockRestore()
  }

  expect(thrown).toBeInstanceOf(ApiError)
  expect((thrown as ApiError).status).toBe(500)
  expect((thrown as ApiError).message).toBe(
    'This workflow is too complex to evaluate. Please keep workflows under 150 tasks.',
  )
})

// ── 6. Cycle detection ────────────────────────────────────────────────────────

it('throws when a cycle is detected in the workflow dependency graph', () => {
  const a = makeTask('A')
  const b = makeTask('B')
  makeDep(b.id, a.id) // B depends on A
  makeDep(a.id, b.id) // A depends on B  ← closes the cycle

  expect(() => buildAncestorMap(db, WORKFLOW_ID)).toThrow()
})
