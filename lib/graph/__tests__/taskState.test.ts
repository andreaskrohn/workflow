/**
 * One test per task-state rule, as documented in lib/graph/taskState.ts.
 *
 * Rules 1–7  — pure computation (no DB)
 * Rules 8–10 — archiving cascade (DB integration)
 */

import Database from 'better-sqlite3'
import { resetDatabase } from '../../../tests/setup'
import { computeEnabledTasks, type TaskState, type DepEdge } from '../taskState'
import { createTask, archiveTask } from '../../db/repositories/taskRepository'
import {
  createDependency,
  getDependencyById,
} from '../../db/repositories/taskDependencyRepository'

// ── helpers ───────────────────────────────────────────────────────────────────

function t(id: string, status: TaskState['status']): TaskState {
  return { id, status }
}

function d(task_id: string, depends_on_task_id: string): DepEdge {
  return { task_id, depends_on_task_id }
}

// ── DB setup for rules 8–10 ───────────────────────────────────────────────────

let db: Database.Database

beforeEach(() => {
  resetDatabase()
  db = new Database(process.env['DATABASE_URL']!)
  db.pragma('foreign_keys = ON')
})

afterEach(() => {
  db.close()
})

// ── Rule 1 ────────────────────────────────────────────────────────────────────

it('Rule 1 — blocked task is never enabled, even with no prerequisites', () => {
  const result = computeEnabledTasks([t('a', 'blocked')], [])
  expect(result.has('a')).toBe(false)
})

// ── Rule 2 ────────────────────────────────────────────────────────────────────

it('Rule 2 — todo task with no prerequisites is enabled', () => {
  const result = computeEnabledTasks([t('a', 'todo')], [])
  expect(result.has('a')).toBe(true)
})

// ── Rule 3 ────────────────────────────────────────────────────────────────────

it('Rule 3 — done task is enabled even when its prerequisite is not yet done', () => {
  // b is marked done out of order while its prereq a is still todo
  const tasks = [t('a', 'todo'), t('b', 'done')]
  const deps = [d('b', 'a')]
  const result = computeEnabledTasks(tasks, deps)
  expect(result.has('b')).toBe(true)
})

// ── Rule 4 ────────────────────────────────────────────────────────────────────

it('Rule 4 — todo task is not enabled when its direct prerequisite is not done', () => {
  const tasks = [t('a', 'todo'), t('b', 'todo')]
  const deps = [d('b', 'a')] // b depends on a
  const result = computeEnabledTasks(tasks, deps)
  expect(result.has('b')).toBe(false)
  expect(result.has('a')).toBe(true) // a has no prereqs → enabled
})

// ── Rule 5 ────────────────────────────────────────────────────────────────────

it('Rule 5 — enablement is transitive: leaf is blocked by unfinished ancestor even when direct prereq is done', () => {
  // root(todo) ← mid(done) ← leaf(todo)
  // mid is done (Rule 3 keeps it enabled), but leaf's transitive ancestor root is todo
  const tasks = [t('root', 'todo'), t('mid', 'done'), t('leaf', 'todo')]
  const deps = [d('mid', 'root'), d('leaf', 'mid')]
  const result = computeEnabledTasks(tasks, deps)
  expect(result.has('leaf')).toBe(false)
})

// ── Rule 6 ────────────────────────────────────────────────────────────────────

it('Rule 6 — task with multiple prerequisites is not enabled when only one is done', () => {
  const tasks = [t('a', 'done'), t('b', 'todo'), t('c', 'todo')]
  const deps = [d('c', 'a'), d('c', 'b')] // c depends on both a and b
  const result = computeEnabledTasks(tasks, deps)
  expect(result.has('c')).toBe(false)
})

// ── Rule 7 ────────────────────────────────────────────────────────────────────

it('Rule 7 — a cycle in the dependency graph does not cause infinite recursion', () => {
  const tasks = [t('a', 'todo'), t('b', 'todo')]
  const deps = [d('b', 'a'), d('a', 'b')] // a ↔ b cycle
  expect(() => computeEnabledTasks(tasks, deps)).not.toThrow()
})

// ── Rule 8 ────────────────────────────────────────────────────────────────────

it('Rule 8 — archiving a task soft-deletes active dep edges where it is the dependent (task_id)', () => {
  const prereq = createTask(db, { title: 'Prereq' })
  const main = createTask(db, { title: 'Main' })
  const edge = createDependency(db, { task_id: main.id, depends_on_task_id: prereq.id })

  archiveTask(db, main.id)

  expect(getDependencyById(db, edge.id)?.archived_at).not.toBeNull()
})

// ── Rule 9 ────────────────────────────────────────────────────────────────────

it('Rule 9 — archiving a task soft-deletes active dep edges where it is the dependency target (depends_on_task_id)', () => {
  const prereq = createTask(db, { title: 'Prereq' })
  const main = createTask(db, { title: 'Main' })
  const edge = createDependency(db, { task_id: main.id, depends_on_task_id: prereq.id })

  archiveTask(db, prereq.id)

  expect(getDependencyById(db, edge.id)?.archived_at).not.toBeNull()
})

// ── Rule 10 ───────────────────────────────────────────────────────────────────

it('Rule 10 — pre-archived dep edges are not overwritten; original archived_at is preserved', () => {
  const prereq = createTask(db, { title: 'Prereq' })
  const main = createTask(db, { title: 'Main' })
  const edge = createDependency(db, { task_id: main.id, depends_on_task_id: prereq.id })

  const originalTs = 1_000_000_000
  db.prepare('UPDATE task_dependencies SET archived_at = ? WHERE id = ?').run(originalTs, edge.id)

  archiveTask(db, main.id)

  expect(getDependencyById(db, edge.id)?.archived_at).toBe(originalTs)
})
