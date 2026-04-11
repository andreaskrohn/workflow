import { NextRequest } from 'next/server'
import { CSRF_TOKEN } from '@/lib/middleware/csrf'
import { POST } from '../route'
import { resetDatabase } from '../../../../../tests/setup'
import Database from 'better-sqlite3'
import { createWorkflow } from '@/lib/db/repositories/workflowRepository'
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
const freshIp = () => `10.4.${Math.floor(++rlSeq / 256)}.${rlSeq % 256}`

function makeReq(
  body?: unknown,
  { ip = '1.1.1.1', token = CSRF_TOKEN as string | null }: { ip?: string; token?: string | null } = {},
): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (ip) headers['x-forwarded-for'] = ip
  if (token !== null) headers['x-csrf-token'] = token
  return new NextRequest('http://localhost/api/workflows/reorder', {
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

let wfA: string
let wfB: string

beforeEach(() => {
  resetAll()
  const db = new Database(process.env["DATABASE_URL"]!)
  db.pragma("busy_timeout = 5000")
  wfA = createWorkflow(db, { project_id: PROJECT_ID, name: 'A' }).id
  wfB = createWorkflow(db, { project_id: PROJECT_ID, name: 'B' }).id
  db.close()
})

// ── POST /api/workflows/reorder ───────────────────────────────────────────────

it('reorders workflows and returns { ok: true }', async () => {
  const res = await POST(makeReq({ project_id: PROJECT_ID, ordered_ids: [wfB, wfA] }))
  expect(res.status).toBe(200)
  const body = await res.json() as { ok: boolean }
  expect(body.ok).toBe(true)
})

it('returns 403 when CSRF token is missing', async () => {
  const res = await POST(makeReq({ project_id: PROJECT_ID, ordered_ids: [] }, { token: null }))
  expect(res.status).toBe(403)
})

it('returns 403 when CSRF token is wrong', async () => {
  const res = await POST(makeReq({ project_id: PROJECT_ID, ordered_ids: [] }, { token: 'bad' }))
  expect(res.status).toBe(403)
})

it('returns 422 when project_id is missing', async () => {
  const res = await POST(makeReq({ ordered_ids: [wfA] }))
  expect(res.status).toBe(422)
  const body = await res.json() as { error: string }
  expect(body.error).toBe('project_id is required.')
})

it('returns 422 when ordered_ids is not an array of strings', async () => {
  const res = await POST(makeReq({ project_id: PROJECT_ID, ordered_ids: [1, 2] }))
  expect(res.status).toBe(422)
  const body = await res.json() as { error: string }
  expect(body.error).toBe('ordered_ids must be an array of strings.')
})

it('returns 400 when body is not valid JSON', async () => {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-forwarded-for': '1.1.1.1',
    'x-csrf-token': CSRF_TOKEN,
  }
  const req = new NextRequest('http://localhost/api/workflows/reorder', {
    method: 'POST',
    headers,
    body: '{bad',
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
