/**
 * Small seed — one workflow with 7 tasks for manual graph testing.
 *
 * Topology (LR, depends_on points left):
 *
 *   [1] Define requirements
 *       └─► [2] Design data model  ──┬─► [4] Implement API
 *                                    │         └─► [6] Write integration tests
 *           [3] Set up dev env   ────┘         └─► [7] Deploy to staging
 *                                    └─► [5] Build UI (parallel branch)
 *
 * In dependency terms (task_id depends on depends_on_task_id):
 *   2 → 1
 *   3 → 1
 *   4 → 2, 4 → 3
 *   5 → 2            (parallel to 4)
 *   6 → 4
 *   7 → 6
 */

import Database from 'better-sqlite3'
import path from 'path'
import os from 'os'
import { randomUUID } from 'crypto'

const DB_PATH =
  process.env['DATABASE_URL'] ??
  path.join(os.homedir(), 'Documents', 'workflow-data', 'workflow.db')

interface TaskDef {
  title: string
  status: 'todo' | 'in_progress' | 'done' | 'blocked'
  priority: number
  end_goal: string | null
  position_x: number
  position_y: number
}

interface DepDef {
  from: number // 1-based index into TASKS
  to: number
}

const TASKS: TaskDef[] = [
  {
    title: 'Define requirements',
    status: 'done',
    priority: 5,
    end_goal: 'Ship a working feature end-to-end',
    position_x: 80,
    position_y: 200,
  },
  {
    title: 'Design data model',
    status: 'done',
    priority: 4,
    end_goal: null,
    position_x: 340,
    position_y: 120,
  },
  {
    title: 'Set up dev environment',
    status: 'done',
    priority: 3,
    end_goal: null,
    position_x: 340,
    position_y: 300,
  },
  {
    title: 'Implement API',
    status: 'in_progress',
    priority: 4,
    end_goal: null,
    position_x: 600,
    position_y: 120,
  },
  {
    title: 'Build UI',
    status: 'todo',
    priority: 3,
    end_goal: null,
    position_x: 600,
    position_y: 300,
  },
  {
    title: 'Write integration tests',
    status: 'todo',
    priority: 4,
    end_goal: null,
    position_x: 860,
    position_y: 80,
  },
  {
    title: 'Deploy to staging',
    status: 'todo',
    priority: 5,
    end_goal: null,
    position_x: 1120,
    position_y: 120,
  },
]

const DEPS: DepDef[] = [
  { from: 2, to: 1 }, // Design data model depends on Define requirements
  { from: 3, to: 1 }, // Set up dev env depends on Define requirements
  { from: 4, to: 2 }, // Implement API depends on Design data model
  { from: 4, to: 3 }, // Implement API depends on Set up dev env
  { from: 5, to: 2 }, // Build UI depends on Design data model (parallel branch)
  { from: 6, to: 4 }, // Write integration tests depends on Implement API
  { from: 7, to: 6 }, // Deploy to staging depends on Write integration tests
]

function main(): void {
  const db = new Database(DB_PATH)
  db.pragma('foreign_keys = ON')

  const now = Math.floor(Date.now() / 1000)

  const insertTask = db.prepare(`
    INSERT INTO tasks
      (id, title, status, priority, end_goal, position_x, position_y,
       description, notes, due_date, created_at, updated_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)
  `)

  const insertDep = db.prepare(`
    INSERT INTO task_dependencies (id, task_id, depends_on_task_id, created_at)
    VALUES (?, ?, ?, ?)
  `)

  const seed = db.transaction(() => {
    // Clear existing data.
    db.exec('DELETE FROM task_dependencies')
    db.exec('DELETE FROM tasks')
    db.exec('DELETE FROM tasks_fts')

    const ids: string[] = TASKS.map((t, i) => {
      const id = randomUUID()
      insertTask.run(id, t.title, t.status, t.priority, t.end_goal, t.position_x, t.position_y, now - (TASKS.length - i) * 60, now)
      return id
    })

    for (const dep of DEPS) {
      insertDep.run(randomUUID(), ids[dep.from - 1], ids[dep.to - 1], now)
    }
  })

  seed()

  const taskCount = (db.prepare('SELECT COUNT(*) AS n FROM tasks').get() as { n: number }).n
  const depCount = (db.prepare('SELECT COUNT(*) AS n FROM task_dependencies').get() as { n: number }).n

  console.log(`Seeded ${taskCount} tasks and ${depCount} dependency edges.`)
  console.log('Topology: 1 chain (requirements → model/env → API → tests → staging) + 1 parallel branch (UI).')
  db.close()
}

main()
