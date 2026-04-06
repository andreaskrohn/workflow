import { computeEnabledTasks, type TaskState, type DepEdge } from '../computeTaskStates'

function task(id: string, status: TaskState['status']): TaskState {
  return { id, status }
}

function dep(task_id: string, depends_on_task_id: string): DepEdge {
  return { task_id, depends_on_task_id }
}

describe('computeEnabledTasks', () => {
  it('returns empty set for empty input', () => {
    expect(computeEnabledTasks([], [])).toEqual(new Set())
  })

  it('enables a single todo task with no deps', () => {
    const result = computeEnabledTasks([task('a', 'todo')], [])
    expect(result.has('a')).toBe(true)
  })

  it('enables a single done task with no deps', () => {
    const result = computeEnabledTasks([task('a', 'done')], [])
    expect(result.has('a')).toBe(true)
  })

  it('does not enable a blocked task', () => {
    const result = computeEnabledTasks([task('a', 'blocked')], [])
    expect(result.has('a')).toBe(false)
  })

  it('enables a task whose single dep is done', () => {
    const tasks = [task('a', 'done'), task('b', 'todo')]
    const deps = [dep('b', 'a')]
    const result = computeEnabledTasks(tasks, deps)
    expect(result.has('b')).toBe(true)
  })

  it('does not enable a task whose dep is todo', () => {
    const tasks = [task('a', 'todo'), task('b', 'todo')]
    const deps = [dep('b', 'a')]
    const result = computeEnabledTasks(tasks, deps)
    expect(result.has('b')).toBe(false)
    expect(result.has('a')).toBe(true) // a has no deps, so it is enabled
  })

  it('does not enable a task whose dep is blocked', () => {
    const tasks = [task('a', 'blocked'), task('b', 'todo')]
    const deps = [dep('b', 'a')]
    const result = computeEnabledTasks(tasks, deps)
    expect(result.has('b')).toBe(false)
  })

  it('enables a task when all multiple deps are done', () => {
    const tasks = [task('a', 'done'), task('b', 'done'), task('c', 'todo')]
    const deps = [dep('c', 'a'), dep('c', 'b')]
    const result = computeEnabledTasks(tasks, deps)
    expect(result.has('c')).toBe(true)
  })

  it('does not enable a task when only some deps are done', () => {
    const tasks = [task('a', 'done'), task('b', 'todo'), task('c', 'todo')]
    const deps = [dep('c', 'a'), dep('c', 'b')]
    const result = computeEnabledTasks(tasks, deps)
    expect(result.has('c')).toBe(false)
  })

  it('handles a chain correctly: A(done)→B(todo)→C(todo)', () => {
    const tasks = [task('a', 'done'), task('b', 'todo'), task('c', 'todo')]
    const deps = [dep('b', 'a'), dep('c', 'b')]
    const result = computeEnabledTasks(tasks, deps)
    expect(result.has('a')).toBe(true)  // done, no deps
    expect(result.has('b')).toBe(true)  // todo, dep a is done
    expect(result.has('c')).toBe(false) // todo, dep b is not done
  })

  it('does not enable a blocked task even if all its deps are done', () => {
    const tasks = [task('a', 'done'), task('b', 'blocked')]
    const deps = [dep('b', 'a')]
    const result = computeEnabledTasks(tasks, deps)
    expect(result.has('b')).toBe(false)
  })

  // ── Multi-predecessor correctness (Prompt 2) ─────────────────────────────

  it('task with two predecessors is only enabled when ALL are done, not just one', () => {
    // A done, B todo → C must NOT be enabled
    const tasks = [task('a', 'done'), task('b', 'todo'), task('c', 'todo')]
    const deps = [dep('c', 'a'), dep('c', 'b')]
    const result = computeEnabledTasks(tasks, deps)
    expect(result.has('c')).toBe(false)
  })

  it('task with three predecessors remains disabled if even one is not done', () => {
    const tasks = [task('a', 'done'), task('b', 'done'), task('c', 'todo'), task('d', 'todo')]
    const deps = [dep('d', 'a'), dep('d', 'b'), dep('d', 'c')]
    const result = computeEnabledTasks(tasks, deps)
    expect(result.has('d')).toBe(false)
  })

  it('task with no predecessors is always enabled regardless of other tasks statuses', () => {
    const tasks = [task('a', 'todo'), task('b', 'todo'), task('c', 'todo')]
    const deps = [dep('b', 'a')] // c has no deps
    const result = computeEnabledTasks(tasks, deps)
    expect(result.has('c')).toBe(true)
  })

  it('completing tasks out of order does not incorrectly enable a downstream task', () => {
    // A → C and B → C; marking only A done should NOT enable C
    const tasks = [task('a', 'done'), task('b', 'todo'), task('c', 'todo')]
    const deps = [dep('c', 'a'), dep('c', 'b')]
    const result = computeEnabledTasks(tasks, deps)
    expect(result.has('c')).toBe(false)
    expect(result.has('a')).toBe(true) // done tasks are always enabled
    expect(result.has('b')).toBe(true) // b has no deps, so enabled
  })
})
