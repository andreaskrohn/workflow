import Database from 'better-sqlite3'
import path from 'path'
import os from 'os'
import { randomUUID } from 'crypto'

const DB_PATH = path.join(os.homedir(), 'Documents', 'workflow-data', 'workflow.db')

const STATUSES = ['todo', 'in_progress', 'done', 'blocked'] as const
const PRIORITIES = [1, 2, 3, 4, 5] as const

const TITLE_WORDS = [
  'Research', 'Implement', 'Design', 'Review', 'Deploy', 'Refactor',
  'Document', 'Test', 'Audit', 'Migrate', 'Optimize', 'Monitor',
  'Configure', 'Integrate', 'Validate',
]

const TITLE_SUBJECTS = [
  'authentication flow', 'database schema', 'CI/CD pipeline', 'API endpoints',
  'dashboard UI', 'search index', 'caching layer', 'payment integration',
  'user permissions', 'error handling', 'data export', 'onboarding guide',
  'dependency graph', 'rate limiting', 'audit logging', 'notification system',
  'background jobs', 'feature flags', 'analytics pipeline', 'release process',
]

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function makeTitle(i: number): string {
  return `${pick(TITLE_WORDS)} ${pick(TITLE_SUBJECTS)} (#${i + 1})`
}

function main(): void {
  const db = new Database(DB_PATH)
  db.pragma('foreign_keys = ON')

  const now = Math.floor(Date.now() / 1000)

  const insertTask = db.prepare<[string, string, string, string | null, string, number, number, number, number]>(`
    INSERT INTO tasks (id, title, description, notes, status, priority, due_date, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const insertDep = db.prepare<[string, string, string, number]>(`
    INSERT INTO task_dependencies (id, task_id, depends_on_task_id, created_at)
    VALUES (?, ?, ?, ?)
  `)

  const seed = db.transaction(() => {
    // Clear existing data (seed is idempotent).
    // tasks_fts must be cleared explicitly — there is no AFTER DELETE trigger on tasks.
    db.exec('DELETE FROM task_dependencies')
    db.exec('DELETE FROM tasks')
    db.exec('DELETE FROM tasks_fts')

    const ids: string[] = []

    // --- Insert 100 tasks ---
    for (let i = 0; i < 100; i++) {
      const id = randomUUID()
      const title = makeTitle(i)
      const description = `Detailed work item ${i + 1} in the workflow pipeline. Covers planning, execution, and sign-off.`
      const notes = i % 4 === 0 ? `Follow-up required after task ${Math.max(0, i - 1) + 1}.` : null
      const status = pick(STATUSES)
      const priority = pick(PRIORITIES)
      const dueDate = now + (i + 1) * 86400 // one day apart per task

      insertTask.run(
        id,
        title,
        description,
        notes,
        status,
        priority,
        dueDate,
        now - (100 - i) * 3600,
        now - (100 - i) * 1800,
      )
      ids.push(id)
    }

    // --- Build branching DAG ---
    // Tasks 0-4 are roots (no dependencies).
    // Tasks 5-99 each depend on 1-3 randomly chosen earlier tasks.
    // All dependency targets have a lower index, guaranteeing no cycles.
    for (let i = 5; i < 100; i++) {
      const numDeps = Math.floor(Math.random() * 3) + 1 // 1, 2, or 3
      const chosen = new Set<number>()

      for (let attempt = 0; attempt < numDeps * 4 && chosen.size < numDeps; attempt++) {
        chosen.add(Math.floor(Math.random() * i)) // always < i → no cycles
      }

      for (const depIdx of chosen) {
        insertDep.run(randomUUID(), ids[i], ids[depIdx], now)
      }
    }
  })

  seed()

  const taskCount = (db.prepare('SELECT COUNT(*) AS n FROM tasks').get() as { n: number }).n
  const depCount = (
    db.prepare('SELECT COUNT(*) AS n FROM task_dependencies').get() as { n: number }
  ).n

  console.log(`Seeded ${taskCount} tasks and ${depCount} dependency edges (branching DAG).`)
  db.close()
}

main()
