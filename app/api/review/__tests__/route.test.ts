import { NextRequest } from 'next/server'
import { GET } from '../route'
import { resetDatabase } from '../../../../tests/setup'
import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { createWorkflow } from '@/lib/db/repositories/workflowRepository'
import { createTask, updateTask } from '@/lib/db/repositories/taskRepository'
import { createDependency } from '@/lib/db/repositories/taskDependencyRepository'

// ── Timestamp helpers ─────────────────────────────────────────────────────────

/** UTC midnight of today as a Unix timestamp (seconds). */
function todayTs(): number {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return Math.floor(d.getTime() / 1000)
}

const yesterdayTs = () => todayTs() - 86400
const tomorrowTs = () => todayTs() + 86400

// ── Test-DB project setup ─────────────────────────────────────────────────────

let PROJECT_ID: string

beforeAll(() => {
  const spaceId = randomUUID()
  PROJECT_ID = randomUUID()
  const d = new Database(process.env['DATABASE_URL']!)
  d.pragma('busy_timeout = 5000')
  d.pragma('foreign_keys = OFF')
  const now = Math.floor(Date.now() / 1000)
  d.prepare('INSERT INTO spaces (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(spaceId, 'S', now, now)
  d.prepare('INSERT INTO projects (id, space_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(PROJECT_ID, spaceId, 'P', now, now)
  d.pragma('foreign_keys = ON')
  d.close()
})

// ── Helpers ───────────────────────────────────────────────────────────────────

let rlSeq = 0
const freshIp = () => `10.8.${Math.floor(++rlSeq / 256)}.${rlSeq % 256}`

function makeGet(ip = '1.1.1.1'): NextRequest {
  return new NextRequest('http://localhost/api/review', {
    method: 'GET',
    headers: { 'x-forwarded-for': ip },
  })
}

function db(): Database.Database {
  const d = new Database(process.env['DATABASE_URL']!)
  d.pragma('busy_timeout = 5000')
  d.pragma('foreign_keys = OFF')
  return d
}

function makeWorkflow(name: string, reviewDate: number | null = null) {
  const d = db()
  const wf = createWorkflow(d, { project_id: PROJECT_ID, name })
  if (reviewDate !== null) {
    d.prepare('UPDATE workflows SET review_date = ? WHERE id = ?').run(reviewDate, wf.id)
  }
  d.close()
  return wf
}

function resetAll() {
  resetDatabase()
  const d = db()
  d.prepare('DELETE FROM workflows WHERE project_id = ?').run(PROJECT_ID)
  d.close()
}

beforeEach(resetAll)

// ── Basic responses ───────────────────────────────────────────────────────────

it('returns 200 with an empty array when no workflows are due for review', async () => {
  const res = await GET(makeGet())
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual([])
})

it('returns a workflow whose review_date is today (UTC midnight)', async () => {
  makeWorkflow('Today review', todayTs())

  const res = await GET(makeGet())
  const body = await res.json() as { name: string }[]
  expect(body).toHaveLength(1)
  expect(body[0]!.name).toBe('Today review')
})

it('returns a workflow whose review_date is in the past', async () => {
  makeWorkflow('Overdue review', yesterdayTs())

  const res = await GET(makeGet())
  const body = await res.json() as { name: string }[]
  expect(body).toHaveLength(1)
  expect(body[0]!.name).toBe('Overdue review')
})

it('excludes a workflow whose review_date is in the future', async () => {
  makeWorkflow('Future review', tomorrowTs())

  const res = await GET(makeGet())
  expect(await res.json()).toEqual([])
})

it('excludes a workflow with review_date IS NULL', async () => {
  makeWorkflow('No review date', null)

  const res = await GET(makeGet())
  expect(await res.json()).toEqual([])
})

it('excludes archived workflows even when review_date is due', async () => {
  const wf = makeWorkflow('Archived', yesterdayTs())
  const d = db()
  d.prepare('UPDATE workflows SET archived_at = ? WHERE id = ?').run(
    Math.floor(Date.now() / 1000),
    wf.id,
  )
  d.close()

  const res = await GET(makeGet())
  expect(await res.json()).toEqual([])
})

// ── Payload fields ────────────────────────────────────────────────────────────

it('response includes id, name, end_goal, review_date, and enabled_task_count', async () => {
  const wf = makeWorkflow('Fields test', todayTs())
  const d = db()
  d.prepare('UPDATE workflows SET end_goal = ? WHERE id = ?').run('Ship it', wf.id)
  d.close()

  const res = await GET(makeGet())
  const [item] = await res.json() as {
    id: string; name: string; end_goal: string | null; review_date: number; enabled_task_count: number
  }[]
  expect(item!.id).toBe(wf.id)
  expect(item!.name).toBe('Fields test')
  expect(item!.end_goal).toBe('Ship it')
  expect(item!.review_date).toBe(todayTs())
  expect(typeof item!.enabled_task_count).toBe('number')
})

it('end_goal is null when not set', async () => {
  makeWorkflow('No goal', todayTs())

  const res = await GET(makeGet())
  const [item] = await res.json() as { end_goal: string | null }[]
  expect(item!.end_goal).toBeNull()
})

// ── enabled_task_count ────────────────────────────────────────────────────────

it('enabled_task_count is 0 when the workflow has no tasks', async () => {
  makeWorkflow('Empty workflow', todayTs())

  const res = await GET(makeGet())
  const [item] = await res.json() as { enabled_task_count: number }[]
  expect(item!.enabled_task_count).toBe(0)
})

it('enabled_task_count counts todo tasks with no unmet dependencies', async () => {
  const wf = makeWorkflow('Active workflow', todayTs())
  const d = db()
  // Two independent todo tasks — both enabled
  createTask(d, { title: 'T1', workflow_id: wf.id })
  createTask(d, { title: 'T2', workflow_id: wf.id })
  d.close()

  const res = await GET(makeGet())
  const [item] = await res.json() as { enabled_task_count: number }[]
  expect(item!.enabled_task_count).toBe(2)
})

it('enabled_task_count excludes done tasks', async () => {
  const wf = makeWorkflow('Done workflow', todayTs())
  const d = db()
  const t = createTask(d, { title: 'Done', workflow_id: wf.id })
  updateTask(d, t.id, { status: 'done' })
  d.close()

  const res = await GET(makeGet())
  const [item] = await res.json() as { enabled_task_count: number }[]
  expect(item!.enabled_task_count).toBe(0)
})

it('enabled_task_count excludes blocked tasks', async () => {
  const wf = makeWorkflow('Blocked workflow', todayTs())
  const d = db()
  const t = createTask(d, { title: 'Blocked', workflow_id: wf.id })
  updateTask(d, t.id, { status: 'blocked' })
  d.close()

  const res = await GET(makeGet())
  const [item] = await res.json() as { enabled_task_count: number }[]
  expect(item!.enabled_task_count).toBe(0)
})

it('enabled_task_count excludes todo tasks whose dependency is not yet done', async () => {
  const wf = makeWorkflow('Chain workflow', todayTs())
  const d = db()
  const t1 = createTask(d, { title: 'T1', workflow_id: wf.id })
  const t2 = createTask(d, { title: 'T2', workflow_id: wf.id })
  // T2 depends on T1, so T2 is blocked until T1 is done
  createDependency(d, { task_id: t2.id, depends_on_task_id: t1.id })
  d.close()

  const res = await GET(makeGet())
  const [item] = await res.json() as { enabled_task_count: number }[]
  // Only T1 is enabled; T2 is waiting on T1
  expect(item!.enabled_task_count).toBe(1)
})

it('enabled_task_count counts T2 once T1 is done', async () => {
  const wf = makeWorkflow('Unblocked workflow', todayTs())
  const d = db()
  const t1 = createTask(d, { title: 'T1', workflow_id: wf.id })
  const t2 = createTask(d, { title: 'T2', workflow_id: wf.id })
  createDependency(d, { task_id: t2.id, depends_on_task_id: t1.id })
  updateTask(d, t1.id, { status: 'done' })
  d.close()

  const res = await GET(makeGet())
  const [item] = await res.json() as { enabled_task_count: number }[]
  // T1 done (not counted), T2 now enabled
  expect(item!.enabled_task_count).toBe(1)
})

// ── Ordering ──────────────────────────────────────────────────────────────────

it('orders workflows by review_date ASC (most overdue first)', async () => {
  makeWorkflow('Recent overdue', yesterdayTs())
  makeWorkflow('Older overdue', yesterdayTs() - 86400)

  const res = await GET(makeGet())
  const body = await res.json() as { name: string }[]
  expect(body.map((w) => w.name)).toEqual(['Older overdue', 'Recent overdue'])
})

// ── Rate limiting ─────────────────────────────────────────────────────────────

it('returns 429 after exceeding the rate limit', async () => {
  const ip = freshIp()
  for (let i = 0; i < 100; i++) {
    await GET(makeGet(ip))
  }
  const res = await GET(makeGet(ip))
  expect(res.status).toBe(429)
  expect(res.headers.get('Retry-After')).toBeTruthy()
})
