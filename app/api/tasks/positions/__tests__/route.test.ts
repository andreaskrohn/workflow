import { NextRequest } from 'next/server'
import { CSRF_TOKEN } from '@/lib/middleware/csrf'
import { POST } from '../route'
import { resetDatabase } from '../../../../../tests/setup'
import Database from 'better-sqlite3'
import { createWorkflow } from '@/lib/db/repositories/workflowRepository'
import { createTask } from '@/lib/db/repositories/taskRepository'
import { randomUUID } from 'crypto'

// ── Test-DB project setup ─────────────────────────────────────────────────────

let PROJECT_ID: string

beforeAll(() => {
  const spaceId = randomUUID()
  PROJECT_ID = randomUUID()
  const db = new Database(process.env["DATABASE_URL"]!)
  db.pragma("busy_timeout = 5000")
  db.pragma('foreign_keys = OFF')
  const now = Math.floor(Date.now() / 1000)
  db.prepare('INSERT INTO spaces (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(spaceId, 'T', now, now)
  db.prepare('INSERT INTO projects (id, space_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(PROJECT_ID, spaceId, 'T', now, now)
  db.pragma('foreign_keys = ON')
  db.close()
})

// ── Helpers ───────────────────────────────────────────────────────────────────

let rlSeq = 0
const freshIp = () => `10.8.${Math.floor(++rlSeq / 256)}.${rlSeq % 256}`

function makeReq(
  body?: unknown,
  { ip = '1.1.1.1', token = CSRF_TOKEN as string | null }: { ip?: string; token?: string | null } = {},
): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (ip) headers['x-forwarded-for'] = ip
  if (token !== null) headers['x-csrf-token'] = token
  return new NextRequest('http://localhost/api/tasks/positions', {
    method: 'POST',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

function resetAll() {
  resetDatabase()
  const db = new Database(process.env["DATABASE_URL"]!)
  db.pragma("busy_timeout = 5000")
  db.pragma('foreign_keys = OFF')
  db.prepare('DELETE FROM workflows WHERE project_id = ?').run(PROJECT_ID)
  db.pragma('foreign_keys = ON')
  db.close()
}

let taskId: string

beforeEach(() => {
  resetAll()
  const db = new Database(process.env["DATABASE_URL"]!)
  db.pragma("busy_timeout = 5000")
  const wfId = createWorkflow(db, { project_id: PROJECT_ID, name: 'WF' }).id
  taskId = createTask(db, { title: 'Positioned', workflow_id: wfId }).id
  db.close()
})

// ── POST /api/tasks/positions ─────────────────────────────────────────────────

it('updates task positions and returns { updated: N }', async () => {
  const res = await POST(makeReq({ positions: [{ id: taskId, position_x: 10, position_y: 20 }] }))
  expect(res.status).toBe(200)
  const body = await res.json() as { updated: number }
  expect(body.updated).toBe(1)
})

it('returns 403 when CSRF token is missing', async () => {
  const res = await POST(
    makeReq({ positions: [{ id: taskId, position_x: 0, position_y: 0 }] }, { token: null }),
  )
  expect(res.status).toBe(403)
})

it('returns 403 when CSRF token is wrong', async () => {
  const res = await POST(
    makeReq({ positions: [{ id: taskId, position_x: 0, position_y: 0 }] }, { token: 'bad' }),
  )
  expect(res.status).toBe(403)
})

it('returns 422 with UK English message when positions array is empty', async () => {
  const res = await POST(makeReq({ positions: [] }))
  expect(res.status).toBe(422)
  const body = await res.json() as { error: string }
  expect(body.error).toBe('At least one position is required.')
})

it('returns 422 with UK English message when id is not a UUID', async () => {
  const res = await POST(makeReq({ positions: [{ id: 'bad-id', position_x: 0, position_y: 0 }] }))
  expect(res.status).toBe(422)
  const body = await res.json() as { error: string }
  expect(body.error).toBe('id must be a valid UUID.')
})

it('returns 422 when positions key is missing', async () => {
  const res = await POST(makeReq({}))
  expect(res.status).toBe(422)
})

it('returns 400 when body is not valid JSON', async () => {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-forwarded-for': '1.1.1.1',
    'x-csrf-token': CSRF_TOKEN,
  }
  const req = new NextRequest('http://localhost/api/tasks/positions', {
    method: 'POST',
    headers,
    body: 'not-json',
  })
  const res = await POST(req)
  expect(res.status).toBe(400)
})

it('returns 429 with Retry-After after exceeding rate limit', async () => {
  const ip = freshIp()
  for (let i = 0; i < 100; i++) {
    await POST(makeReq({}, { ip }))
  }
  const res = await POST(makeReq({}, { ip }))
  expect(res.status).toBe(429)
  expect(res.headers.get('Retry-After')).toBeTruthy()
})
