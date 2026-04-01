export interface Edge {
  task_id: string
  depends_on_task_id: string
  archived_at?: number | null
}

/**
 * Detects whether adding a new directed edge (fromId → toId) would introduce
 * a cycle in the dependency graph.
 *
 * Uses BFS from `toId` following existing active edges to check whether
 * `fromId` is reachable — if so, adding fromId → toId closes a cycle.
 *
 * @param edges   All active (and optionally archived) dependency rows.
 * @param fromId  The `task_id` of the proposed new edge.
 * @param toId    The `depends_on_task_id` of the proposed new edge.
 * @returns       `true` if the new edge would create a cycle, `false` otherwise.
 */
export function detectCycle(edges: Edge[], fromId: string, toId: string): boolean {
  // A self-loop is always a cycle.
  if (fromId === toId) return true

  // Build adjacency map from active edges only.
  const adj = new Map<string, string[]>()
  for (const e of edges) {
    if (e.archived_at != null) continue
    const targets = adj.get(e.task_id)
    if (targets) {
      targets.push(e.depends_on_task_id)
    } else {
      adj.set(e.task_id, [e.depends_on_task_id])
    }
  }

  // BFS from toId: if we can reach fromId, adding fromId → toId creates a cycle.
  const visited = new Set<string>()
  const queue: string[] = [toId]
  while (queue.length > 0) {
    const node = queue.shift()!
    if (node === fromId) return true
    if (visited.has(node)) continue
    visited.add(node)
    const neighbors = adj.get(node)
    if (neighbors) {
      for (const n of neighbors) {
        if (!visited.has(n)) queue.push(n)
      }
    }
  }

  return false
}
