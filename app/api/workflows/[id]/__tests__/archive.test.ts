import { NextRequest } from 'next/server'
import { CSRF_TOKEN } from '@/lib/middleware/csrf'
import { POST } from '../archive/route'
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

const UNKNOWN_ID = randomUUID()

let rlSeq = 0
const freshIp = () => `10.3.${Math.floor(++rlSeq / 256)}.${rlSeq % 256}`

function ctx(id: string) {
  return { params: { id } }
}

function makeReq(
  id: string,
  { ip = '1.1.1.1', token = CSRF_TOKEN as string | null }: { ip?: string; token?: string | null } = {},
): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (ip) headers['x-forwarded-for'] = ip
  if (token !== null) headers['x-csrf-token'] = token
  return new NextRequest(`http://localhost/api/workflows/${id}/archive`, {
    method: 'POST',
    headers,
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

let workflowId: string

beforeEach(() => {
  resetAll()
  const db = new Database(process.env["DATABASE_URL"]!)
  db.pragma("busy_timeout = 5000")
  const wf = createWorkflow(db, { project_id: PROJECT_ID, name: 'Archivable' })
  workflowId = wf.id
  db.close()
})

// ── POST /api/workflows/[id]/archive ─────────────────────────────────────────

it('archives the workflow and returns { archived: true }', async () => {
  const res = await POST(makeReq(workflowId), ctx(workflowId))
  expect(res.status).toBe(200)
  const body = await res.json() as { archived: boolean }
  expect(body.archived).toBe(true)
})

it('returns 404 for an unknown workflow id', async () => {
  const res = await POST(makeReq(UNKNOWN_ID), ctx(UNKNOWN_ID))
  expect(res.status).toBe(404)
  const body = await res.json() as { error: string }
  expect(body.error).toBe('Workflow not found.')
})

it('returns 409 when the workflow is already archived', async () => {
  await POST(makeReq(workflowId), ctx(workflowId))
  const res = await POST(makeReq(workflowId), ctx(workflowId))
  expect(res.status).toBe(409)
  const body = await res.json() as { error: string }
  expect(body.error).toBe('Workflow is already archived.')
})

it('returns 403 when CSRF token is missing', async () => {
  const res = await POST(makeReq(workflowId, { token: null }), ctx(workflowId))
  expect(res.status).toBe(403)
})

it('returns 403 when CSRF token is wrong', async () => {
  const res = await POST(makeReq(workflowId, { token: 'bad' }), ctx(workflowId))
  expect(res.status).toBe(403)
})

it('returns 429 with Retry-After after exceeding rate limit', async () => {
  const ip = freshIp()
  for (let i = 0; i < 100; i++) {
    await POST(makeReq(UNKNOWN_ID, { ip }), ctx(UNKNOWN_ID))
  }
  const res = await POST(makeReq(UNKNOWN_ID, { ip }), ctx(UNKNOWN_ID))
  expect(res.status).toBe(429)
  expect(res.headers.get('Retry-After')).toBeTruthy()
})
