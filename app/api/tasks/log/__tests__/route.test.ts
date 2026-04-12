import { NextRequest } from 'next/server'
import { GET } from '../route'
import { resetDatabase } from '../../../../../tests/setup'
import Database from 'better-sqlite3'
import { createTask, updateTask } from '@/lib/db/repositories/taskRepository'

// ── Helpers ───────────────────────────────────────────────────────────────────

let rlSeq = 0
const freshIp = () => `10.7.${Math.floor(++rlSeq / 256)}.${rlSeq % 256}`

function makeGet(ip = '1.1.1.1'): NextRequest {
  return new NextRequest('http://localhost/api/tasks/log', {
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

beforeEach(() => {
  resetDatabase()
})

// ── Basic responses ───────────────────────────────────────────────────────────

it('returns 200 with an empty array when there are no completed tasks', async () => {
  const res = await GET(makeGet())
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual([])
})

it('returns completed (done) tasks', async () => {
  const d = db()
  const task = createTask(d, { title: 'Finished feature', workflow_id: null })
  updateTask(d, task.id, { status: 'done' })
  d.close()

  const res = await GET(makeGet())
  const body = await res.json() as { id: string; title: string }[]
  expect(body).toHaveLength(1)
  expect(body[0]!.title).toBe('Finished feature')
})

it('does not return todo tasks', async () => {
  const d = db()
  createTask(d, { title: 'Not done yet', workflow_id: null })
  d.close()

  const res = await GET(makeGet())
  expect(await res.json()).toEqual([])
})

it('does not return blocked tasks', async () => {
  const d = db()
  const task = createTask(d, { title: 'Blocked task', workflow_id: null })
  updateTask(d, task.id, { status: 'blocked' })
  d.close()

  const res = await GET(makeGet())
  expect(await res.json()).toEqual([])
})

it('does not return archived completed tasks', async () => {
  const d = db()
  const task = createTask(d, { title: 'Done and archived', workflow_id: null })
  updateTask(d, task.id, { status: 'done' })
  d.prepare('UPDATE tasks SET archived_at = ? WHERE id = ?').run(
    Math.floor(Date.now() / 1000),
    task.id,
  )
  d.close()

  const res = await GET(makeGet())
  expect(await res.json()).toEqual([])
})

it('includes completed_at in the response', async () => {
  const d = db()
  const task = createTask(d, { title: 'Has timestamp', workflow_id: null })
  updateTask(d, task.id, { status: 'done' })
  d.close()

  const res = await GET(makeGet())
  const body = await res.json() as { completed_at: number | null }[]
  expect(body[0]!.completed_at).not.toBeNull()
  expect(typeof body[0]!.completed_at).toBe('number')
})

// ── Ordering ──────────────────────────────────────────────────────────────────

it('orders tasks by completed_at DESC', async () => {
  const d = db()
  const older = createTask(d, { title: 'Older task', workflow_id: null })
  const newer = createTask(d, { title: 'Newer task', workflow_id: null })
  updateTask(d, older.id, { status: 'done' })
  updateTask(d, newer.id, { status: 'done' })
  // Pin specific timestamps so ordering is deterministic
  d.prepare('UPDATE tasks SET completed_at = ? WHERE id = ?').run(1_000_000, older.id)
  d.prepare('UPDATE tasks SET completed_at = ? WHERE id = ?').run(2_000_000, newer.id)
  d.close()

  const res = await GET(makeGet())
  const body = await res.json() as { title: string }[]
  expect(body.map((t) => t.title)).toEqual(['Newer task', 'Older task'])
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
