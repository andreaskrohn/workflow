import { detectCycle } from '../detectCycle'

// Edge shape: { task_id: string; depends_on_task_id: string }
// A → B means task A depends on task B (edge: task_id=A, depends_on_task_id=B)
// Adding edge C → A when A → B → C already exists would create a cycle.

describe('detectCycle', () => {
  it('returns false for an empty edge list', () => {
    expect(detectCycle([], 'A', 'B')).toBe(false)
  })

  it('returns false for a simple linear chain with no cycle', () => {
    // A → B
    const edges = [{ task_id: 'A', depends_on_task_id: 'B' }]
    expect(detectCycle(edges, 'C', 'A')).toBe(false)
  })

  it('returns true for a direct self-loop', () => {
    // Adding A → A
    expect(detectCycle([], 'A', 'A')).toBe(true)
  })

  it('returns true when adding an edge creates a two-node cycle', () => {
    // A → B already exists; adding B → A creates a cycle
    const edges = [{ task_id: 'A', depends_on_task_id: 'B' }]
    expect(detectCycle(edges, 'B', 'A')).toBe(true)
  })

  it('returns true for a three-node cycle', () => {
    // A → B, B → C already exist; adding C → A closes the cycle
    const edges = [
      { task_id: 'A', depends_on_task_id: 'B' },
      { task_id: 'B', depends_on_task_id: 'C' },
    ]
    expect(detectCycle(edges, 'C', 'A')).toBe(true)
  })

  it('returns false for a DAG that is not a cycle', () => {
    // Diamond: A → B, A → C, B → D, C → D
    const edges = [
      { task_id: 'A', depends_on_task_id: 'B' },
      { task_id: 'A', depends_on_task_id: 'C' },
      { task_id: 'B', depends_on_task_id: 'D' },
      { task_id: 'C', depends_on_task_id: 'D' },
    ]
    // Adding E → A is fine
    expect(detectCycle(edges, 'E', 'A')).toBe(false)
  })

  it('returns true when a new edge closes a longer cycle through a branching graph', () => {
    // A → B, A → C, B → D, C → D; adding D → A closes A→B→D→A
    const edges = [
      { task_id: 'A', depends_on_task_id: 'B' },
      { task_id: 'A', depends_on_task_id: 'C' },
      { task_id: 'B', depends_on_task_id: 'D' },
      { task_id: 'C', depends_on_task_id: 'D' },
    ]
    expect(detectCycle(edges, 'D', 'A')).toBe(true)
  })

  it('ignores archived edges (archived_at present)', () => {
    // A → B is archived; adding B → A should NOT detect a cycle
    const edges = [{ task_id: 'A', depends_on_task_id: 'B', archived_at: 1234567890 }]
    expect(detectCycle(edges, 'B', 'A')).toBe(false)
  })

  it('only uses active edges (archived_at null)', () => {
    // A → B active, A → C archived
    const edges = [
      { task_id: 'A', depends_on_task_id: 'B', archived_at: null },
      { task_id: 'A', depends_on_task_id: 'C', archived_at: 1234567890 },
    ]
    // B → A creates cycle via active A → B
    expect(detectCycle(edges, 'B', 'A')).toBe(true)
    // C → A does NOT create cycle (A → C is archived)
    expect(detectCycle(edges, 'C', 'A')).toBe(false)
  })
})
