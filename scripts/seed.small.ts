/**
 * Small seed — 2 projects, each with 2 workflows, for manual graph + navigation testing.
 *
 * Project 1: Website Launch
 *   Workflow A: Backend API        (5 tasks)
 *   Workflow B: Frontend           (4 tasks)
 *
 * Project 2: Marketing Campaign
 *   Workflow C: Content Strategy   (4 tasks)
 *   Workflow D: Paid Ads           (5 tasks)
 */

import Database from 'better-sqlite3'
import path from 'path'
import os from 'os'
import { randomUUID } from 'crypto'

const DB_PATH =
  process.env['DATABASE_URL'] ??
  path.join(os.homedir(), 'Documents', 'workflow-data', 'workflow.db')

// The default space is seeded by the migration with this fixed ID.
const DEFAULT_SPACE_ID = '00000000-0000-0000-0000-000000000001'

interface TaskDef {
  title: string
  status: 'todo' | 'done' | 'blocked'
  priority: number
  position_x: number
  position_y: number
}

interface DepDef { from: number; to: number }

// ── Project 1: Website Launch ─────────────────────────────────────────────────

const WF_A_NAME = 'Backend API'
const WF_A_GOAL = 'Launch backend with all endpoints live'
const WF_A_TASKS: TaskDef[] = [
  { title: 'Define API contract',    status: 'done',  priority: 5, position_x: 80,   position_y: 148 },
  { title: 'Design DB schema',       status: 'done',  priority: 4, position_x: 310,  position_y: 58  },
  { title: 'Implement endpoints',    status: 'todo',  priority: 4, position_x: 570,  position_y: 58  },
  { title: 'Write API tests',        status: 'todo',  priority: 3, position_x: 830,  position_y: 58  },
  { title: 'Deploy to staging',      status: 'todo',  priority: 5, position_x: 1090, position_y: 148 },
]
const WF_A_DEPS: DepDef[] = [
  { from: 2, to: 1 }, // DB schema ← API contract
  { from: 3, to: 2 }, // Endpoints ← DB schema
  { from: 4, to: 3 }, // Tests ← Endpoints
  { from: 5, to: 4 }, // Deploy ← Tests
]

const WF_B_NAME = 'Frontend'
const WF_B_GOAL = 'Ship a polished, accessible UI'
const WF_B_TASKS: TaskDef[] = [
  { title: 'Create wireframes',       status: 'done',  priority: 4, position_x: 80,   position_y: 166 },
  { title: 'Build components',        status: 'todo',  priority: 4, position_x: 340,  position_y: 86  },
  { title: 'Integrate with API',      status: 'todo',  priority: 4, position_x: 600,  position_y: 86  },
  { title: 'User acceptance testing', status: 'todo',  priority: 3, position_x: 860,  position_y: 166 },
]
const WF_B_DEPS: DepDef[] = [
  { from: 2, to: 1 }, // Components ← Wireframes
  { from: 3, to: 2 }, // Integration ← Components
  { from: 4, to: 3 }, // UAT ← Integration
]

// ── Project 2: Marketing Campaign ────────────────────────────────────────────

const WF_C_NAME = 'Content Strategy'
const WF_C_GOAL = 'Publish a 6-part content series'
const WF_C_TASKS: TaskDef[] = [
  { title: 'Research audience',      status: 'done',  priority: 4, position_x: 80,   position_y: 148 },
  { title: 'Plan content calendar',  status: 'done',  priority: 3, position_x: 340,  position_y: 148 },
  { title: 'Write articles',         status: 'todo',  priority: 4, position_x: 600,  position_y: 148 },
  { title: 'Schedule & publish',     status: 'todo',  priority: 3, position_x: 860,  position_y: 148 },
]
const WF_C_DEPS: DepDef[] = [
  { from: 2, to: 1 },
  { from: 3, to: 2 },
  { from: 4, to: 3 },
]

const WF_D_NAME = 'Paid Ads'
const WF_D_GOAL = 'Launch Q3 ad campaign at target CPA'
const WF_D_TASKS: TaskDef[] = [
  { title: 'Define target audience', status: 'done',  priority: 5, position_x: 80,   position_y: 166 },
  { title: 'Set budget & KPIs',      status: 'done',  priority: 4, position_x: 340,  position_y: 86  },
  { title: 'Create ad creatives',    status: 'todo',  priority: 4, position_x: 600,  position_y: 86  },
  { title: 'Compliance review',      status: 'todo',  priority: 3, position_x: 600,  position_y: 246 },
  { title: 'Launch campaign',        status: 'todo',  priority: 5, position_x: 860,  position_y: 166 },
]
const WF_D_DEPS: DepDef[] = [
  { from: 2, to: 1 },
  { from: 3, to: 2 },
  { from: 4, to: 1 },
  { from: 5, to: 3 },
  { from: 5, to: 4 },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function main(): void {
  const db = new Database(DB_PATH)
  db.pragma('foreign_keys = ON')

  const now = Math.floor(Date.now() / 1000)

  const insertProject = db.prepare(`
    INSERT INTO projects (id, space_id, name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `)
  const insertWorkflow = db.prepare(`
    INSERT INTO workflows (id, project_id, name, end_goal, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  const insertTask = db.prepare(`
    INSERT INTO tasks
      (id, workflow_id, title, status, priority, position_x, position_y,
       description, notes, due_date, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)
  `)
  const insertDep = db.prepare(`
    INSERT INTO task_dependencies (id, task_id, depends_on_task_id, created_at)
    VALUES (?, ?, ?, ?)
  `)

  function seedWorkflow(
    projectId: string,
    name: string,
    endGoal: string,
    tasks: TaskDef[],
    deps: DepDef[],
    createdOffset: number,
    sortOrder: number,
  ) {
    const wfId = randomUUID()
    insertWorkflow.run(wfId, projectId, name, endGoal, sortOrder, now - createdOffset, now)

    const ids = tasks.map((t, i) => {
      const id = randomUUID()
      insertTask.run(id, wfId, t.title, t.status, t.priority, t.position_x, t.position_y, now - (tasks.length - i) * 60, now)
      return id
    })

    for (const dep of deps) {
      insertDep.run(randomUUID(), ids[dep.from - 1], ids[dep.to - 1], now)
    }

    return wfId
  }

  const seed = db.transaction(() => {
    // Clear everything (keep the default space from migration)
    db.exec('DELETE FROM task_dependencies')
    db.exec('DELETE FROM tasks')
    db.exec('DELETE FROM tasks_fts')
    db.exec('DELETE FROM workflows')
    db.exec('DELETE FROM projects')

    // Project 1: Website Launch
    const p1Id = randomUUID()
    insertProject.run(p1Id, DEFAULT_SPACE_ID, 'Website Launch', now - 200, now)
    seedWorkflow(p1Id, WF_A_NAME, WF_A_GOAL, WF_A_TASKS, WF_A_DEPS, 120, 0)
    seedWorkflow(p1Id, WF_B_NAME, WF_B_GOAL, WF_B_TASKS, WF_B_DEPS, 60,  1)

    // Project 2: Marketing Campaign
    const p2Id = randomUUID()
    insertProject.run(p2Id, DEFAULT_SPACE_ID, 'Marketing Campaign', now - 100, now)
    seedWorkflow(p2Id, WF_C_NAME, WF_C_GOAL, WF_C_TASKS, WF_C_DEPS, 80, 0)
    seedWorkflow(p2Id, WF_D_NAME, WF_D_GOAL, WF_D_TASKS, WF_D_DEPS, 40, 1)
  })

  seed()

  const projectCount = (db.prepare('SELECT COUNT(*) AS n FROM projects').get() as { n: number }).n
  const workflowCount = (db.prepare('SELECT COUNT(*) AS n FROM workflows').get() as { n: number }).n
  const taskCount = (db.prepare('SELECT COUNT(*) AS n FROM tasks').get() as { n: number }).n
  const depCount = (db.prepare('SELECT COUNT(*) AS n FROM task_dependencies').get() as { n: number }).n

  console.log(`Seeded ${projectCount} projects, ${workflowCount} workflows, ${taskCount} tasks, ${depCount} dependency edges.`)
  console.log('  Project 1 — Website Launch:')
  console.log(`    • ${WF_A_NAME}: ${WF_A_TASKS.length} tasks`)
  console.log(`    • ${WF_B_NAME}: ${WF_B_TASKS.length} tasks`)
  console.log('  Project 2 — Marketing Campaign:')
  console.log(`    • ${WF_C_NAME}: ${WF_C_TASKS.length} tasks`)
  console.log(`    • ${WF_D_NAME}: ${WF_D_TASKS.length} tasks`)
  db.close()
}

main()
