import Database from 'better-sqlite3'
import { resetDatabase } from '../../../tests/setup'
import { evaluateWorkflowStates } from '../evaluateWorkflowStates'
import { createTask, updateTask, archiveTask } from '../../db/repositories/taskRepository'
import { createDependency, archiveDependency } from '../../db/repositories/taskDependencyRepository'

// Default workflow seeded by migration 0005
const WORKFLOW_ID = '00000000-0000-0000-0000-000000000003'

let db: Database.Database

beforeEach(() => {
  resetDatabase()
  db = new Database(process.env['DATABASE_URL']!)
})

afterEach(() => {
  db.close()
})

// ── helpers ───────────────────────────────────────────────────────────────────

function enabled(states: ReturnType<typeof evaluateWorkflowStates>, id: string): boolean {
  const s = states.find((x) => x.id === id)
  if (!s) throw new Error(`Task ${id} not found in states`)
  return s.enabled
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('evaluateWorkflowStates', () => {
  it('returns empty array for a workflow with no tasks', () => {
    expect(evaluateWorkflowStates(db, WORKFLOW_ID)).toEqual([])
  })

  it('single task with no dependencies is enabled', () => {
    const t = createTask(db, { workflow_id: WORKFLOW_ID, title: 'A' })
    const states = evaluateWorkflowStates(db, WORKFLOW_ID)
    expect(enabled(states, t.id)).toBe(true)
  })

  it('blocked task is not enabled', () => {
    const t = createTask(db, { workflow_id: WORKFLOW_ID, title: 'A', status: 'blocked' })
    expect(enabled(evaluateWorkflowStates(db, WORKFLOW_ID), t.id)).toBe(false)
  })

  // ── multi-predecessor (Prompt 2) ───────────────────────────────────────────

  it('task with two predecessors: only enabled when BOTH are done, not just one', () => {
    const a = createTask(db, { workflow_id: WORKFLOW_ID, title: 'A', status: 'todo' })
    const b = createTask(db, { workflow_id: WORKFLOW_ID, title: 'B', status: 'done' })
    const c = createTask(db, { workflow_id: WORKFLOW_ID, title: 'C', status: 'todo' })
    createDependency(db, { task_id: c.id, depends_on_task_id: a.id })
    createDependency(db, { task_id: c.id, depends_on_task_id: b.id })

    // B done, A not done → C not enabled
    expect(enabled(evaluateWorkflowStates(db, WORKFLOW_ID), c.id)).toBe(false)

    // Mark A done → now both done → C enabled
    updateTask(db, a.id, { status: 'done' })
    expect(enabled(evaluateWorkflowStates(db, WORKFLOW_ID), c.id)).toBe(true)
  })

  it('task with three predecessors remains disabled if even one is not done', () => {
    const a = createTask(db, { workflow_id: WORKFLOW_ID, title: 'A', status: 'done' })
    const b = createTask(db, { workflow_id: WORKFLOW_ID, title: 'B', status: 'done' })
    const c = createTask(db, { workflow_id: WORKFLOW_ID, title: 'C', status: 'todo' })
    const d = createTask(db, { workflow_id: WORKFLOW_ID, title: 'D', status: 'todo' })
    createDependency(db, { task_id: d.id, depends_on_task_id: a.id })
    createDependency(db, { task_id: d.id, depends_on_task_id: b.id })
    createDependency(db, { task_id: d.id, depends_on_task_id: c.id })

    // A and B done, C not done → D still disabled
    expect(enabled(evaluateWorkflowStates(db, WORKFLOW_ID), d.id)).toBe(false)
  })

  it('completing tasks out of order does not incorrectly enable downstream tasks', () => {
    const a = createTask(db, { workflow_id: WORKFLOW_ID, title: 'A', status: 'todo' })
    const b = createTask(db, { workflow_id: WORKFLOW_ID, title: 'B', status: 'todo' })
    const c = createTask(db, { workflow_id: WORKFLOW_ID, title: 'C', status: 'todo' })
    createDependency(db, { task_id: c.id, depends_on_task_id: a.id })
    createDependency(db, { task_id: c.id, depends_on_task_id: b.id })

    updateTask(db, a.id, { status: 'done' })
    // Only A done, B still todo → C must NOT be enabled
    expect(enabled(evaluateWorkflowStates(db, WORKFLOW_ID), c.id)).toBe(false)
  })

  // ── trigger 1: removing a connection ──────────────────────────────────────

  it('removing a connection enables a previously waiting task', () => {
    const a = createTask(db, { workflow_id: WORKFLOW_ID, title: 'A', status: 'todo' })
    const b = createTask(db, { workflow_id: WORKFLOW_ID, title: 'B', status: 'todo' })
    const dep = createDependency(db, { task_id: b.id, depends_on_task_id: a.id })

    expect(enabled(evaluateWorkflowStates(db, WORKFLOW_ID), b.id)).toBe(false)

    archiveDependency(db, dep.id)
    expect(enabled(evaluateWorkflowStates(db, WORKFLOW_ID), b.id)).toBe(true)
  })

  // ── trigger 2: adding a connection ────────────────────────────────────────

  it('adding a connection disables a previously enabled task', () => {
    const a = createTask(db, { workflow_id: WORKFLOW_ID, title: 'A', status: 'todo' })
    const b = createTask(db, { workflow_id: WORKFLOW_ID, title: 'B', status: 'todo' })

    expect(enabled(evaluateWorkflowStates(db, WORKFLOW_ID), b.id)).toBe(true)

    createDependency(db, { task_id: b.id, depends_on_task_id: a.id })
    expect(enabled(evaluateWorkflowStates(db, WORKFLOW_ID), b.id)).toBe(false)
  })

  // ── trigger 3: adding a new task ──────────────────────────────────────────

  it('a newly added disconnected task is immediately enabled', () => {
    createTask(db, { workflow_id: WORKFLOW_ID, title: 'A', status: 'done' })
    const b = createTask(db, { workflow_id: WORKFLOW_ID, title: 'B' })
    const states = evaluateWorkflowStates(db, WORKFLOW_ID)
    expect(enabled(states, b.id)).toBe(true)
  })

  // ── trigger 4: removing (archiving) a task ────────────────────────────────

  it('archiving a blocking task enables its dependent', () => {
    const a = createTask(db, { workflow_id: WORKFLOW_ID, title: 'A', status: 'todo' })
    const b = createTask(db, { workflow_id: WORKFLOW_ID, title: 'B', status: 'todo' })
    createDependency(db, { task_id: b.id, depends_on_task_id: a.id })

    expect(enabled(evaluateWorkflowStates(db, WORKFLOW_ID), b.id)).toBe(false)

    // archiveTask also soft-deletes the dep
    archiveTask(db, a.id)
    // A no longer in results; B now has no active deps → enabled
    const states = evaluateWorkflowStates(db, WORKFLOW_ID)
    expect(states.find((s) => s.id === a.id)).toBeUndefined()
    expect(enabled(states, b.id)).toBe(true)
  })

  it('archived task is excluded from evaluation results', () => {
    const t = createTask(db, { workflow_id: WORKFLOW_ID, title: 'A' })
    archiveTask(db, t.id)
    const states = evaluateWorkflowStates(db, WORKFLOW_ID)
    expect(states.find((s) => s.id === t.id)).toBeUndefined()
  })

  // ── trigger 5: marking a task done ────────────────────────────────────────

  it('marking a task done enables its downstream dependent', () => {
    const a = createTask(db, { workflow_id: WORKFLOW_ID, title: 'A', status: 'todo' })
    const b = createTask(db, { workflow_id: WORKFLOW_ID, title: 'B', status: 'todo' })
    createDependency(db, { task_id: b.id, depends_on_task_id: a.id })

    expect(enabled(evaluateWorkflowStates(db, WORKFLOW_ID), b.id)).toBe(false)

    updateTask(db, a.id, { status: 'done' })
    expect(enabled(evaluateWorkflowStates(db, WORKFLOW_ID), b.id)).toBe(true)
  })

  it('chain A(done)→B(todo)→C(todo): B is enabled, C is not', () => {
    const a = createTask(db, { workflow_id: WORKFLOW_ID, title: 'A', status: 'done' })
    const b = createTask(db, { workflow_id: WORKFLOW_ID, title: 'B', status: 'todo' })
    const c = createTask(db, { workflow_id: WORKFLOW_ID, title: 'C', status: 'todo' })
    createDependency(db, { task_id: b.id, depends_on_task_id: a.id })
    createDependency(db, { task_id: c.id, depends_on_task_id: b.id })

    const states = evaluateWorkflowStates(db, WORKFLOW_ID)
    expect(enabled(states, a.id)).toBe(true)  // done tasks are included and enabled
    expect(enabled(states, b.id)).toBe(true)
    expect(enabled(states, c.id)).toBe(false)
  })

  // ── trigger 6: archived dep is ignored ────────────────────────────────────

  it('archived dependency is ignored when evaluating states', () => {
    const a = createTask(db, { workflow_id: WORKFLOW_ID, title: 'A', status: 'todo' })
    const b = createTask(db, { workflow_id: WORKFLOW_ID, title: 'B', status: 'todo' })
    const dep = createDependency(db, { task_id: b.id, depends_on_task_id: a.id })
    archiveDependency(db, dep.id)

    // Archived dep → B has no active deps → enabled
    expect(enabled(evaluateWorkflowStates(db, WORKFLOW_ID), b.id)).toBe(true)
  })
})
