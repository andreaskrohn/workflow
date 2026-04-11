import Database from 'better-sqlite3'
import { ApiError } from '../utils/errors'

export interface TraversalEdge {
  task_id: string
  depends_on_task_id: string
}

const TIMEOUT_MS = 100
const CHECK_INTERVAL = 10
const TIMEOUT_MESSAGE =
  'This workflow is too complex to evaluate. Please keep workflows under 150 tasks.'

/**
 * Loads all active dependency edges for a workflow in a single DB query, then
 * builds a transitive ancestor map entirely in memory via Kahn's BFS.
 *
 * The returned map associates each task ID with the set of all its ancestors
 * (direct and transitive predecessors in the dependency graph).
 *
 * Throws ApiError(500) if:
 *  - A cycle is detected (nodes remain unprocessed after BFS completes).
 *  - BFS runs for more than 100 ms (checked every 10 iterations).
 *
 * @param db         Open better-sqlite3 database instance.
 * @param workflowId UUID of the workflow to traverse.
 * @returns          Map from task ID → Set of ancestor task IDs.
 */
export function buildAncestorMap(
  db: Database.Database,
  workflowId: string,
): Map<string, Set<string>> {
  // ── 1. Single query: load all active edges for this workflow ─────────────────
  const edges = db
    .prepare<[string]>(`
      SELECT d.task_id, d.depends_on_task_id
      FROM   task_dependencies d
      JOIN   tasks t ON d.task_id = t.id
      WHERE  t.workflow_id = ?
        AND  d.archived_at IS NULL
    `)
    .all(workflowId) as TraversalEdge[]

  const startTime = Date.now()

  // ── 2. Build in-memory adjacency structures from the edge list ───────────────
  const prereqMap = new Map<string, string[]>()    // task → its direct prerequisites
  const dependentMap = new Map<string, string[]>() // prereq → tasks that depend on it
  const allNodes = new Set<string>()

  for (const e of edges) {
    allNodes.add(e.task_id)
    allNodes.add(e.depends_on_task_id)

    const prereqs = prereqMap.get(e.task_id) ?? []
    prereqs.push(e.depends_on_task_id)
    prereqMap.set(e.task_id, prereqs)

    const dependents = dependentMap.get(e.depends_on_task_id) ?? []
    dependents.push(e.task_id)
    dependentMap.set(e.depends_on_task_id, dependents)
  }

  // ── 3. Kahn's BFS — topological order, timeout guard, cycle detection ────────
  const inDegree = new Map<string, number>()
  for (const node of allNodes) {
    inDegree.set(node, (prereqMap.get(node) ?? []).length)
  }

  const queue: string[] = []
  for (const [node, deg] of inDegree) {
    if (deg === 0) queue.push(node)
  }

  const topoOrder: string[] = []
  let iteration = 0

  while (queue.length > 0) {
    iteration++
    if (iteration % CHECK_INTERVAL === 0) {
      if (Date.now() - startTime > TIMEOUT_MS) {
        throw new ApiError(TIMEOUT_MESSAGE, 500)
      }
    }

    const node = queue.shift()!
    topoOrder.push(node)

    for (const dependent of dependentMap.get(node) ?? []) {
      const newDeg = (inDegree.get(dependent) ?? 0) - 1
      inDegree.set(dependent, newDeg)
      if (newDeg === 0) queue.push(dependent)
    }
  }

  // Nodes still in allNodes but not in topoOrder are part of a cycle.
  if (topoOrder.length < allNodes.size) {
    throw new ApiError('Cycle detected in workflow dependency graph.', 500)
  }

  // ── 4. Propagate ancestor sets in topological order ──────────────────────────
  const ancestorMap = new Map<string, Set<string>>()

  for (const node of topoOrder) {
    const prereqs = prereqMap.get(node) ?? []
    const ancestors = new Set<string>()
    for (const prereq of prereqs) {
      ancestors.add(prereq)
      for (const a of ancestorMap.get(prereq) ?? []) {
        ancestors.add(a)
      }
    }
    ancestorMap.set(node, ancestors)
  }

  return ancestorMap
}
