import { NextRequest } from 'next/server'
import { CSRF_TOKEN } from '@/lib/middleware/csrf'
import { GET, PATCH } from '../route'
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
const freshIp = () => `10.2.${Math.floor(++rlSeq / 256)}.${rlSeq % 256}`

function ctx(id: string) {
  return { params: { id } }
}

function makeReq(
  method: string,
  id: string,
  body?: unknown,
  { ip = '1.1.1.1', token = CSRF_TOKEN as string | null }: { ip?: string; token?: string | null } = {},
): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (ip) headers['x-forwarded-for'] = ip
  if (token !== null) headers['x-csrf-token'] = token
  return new NextRequest(`http://localhost/api/workflows/${id}`, {
    method,
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

let workflowId: string

beforeEach(() => {
  resetAll()
  const db = new Database(process.env["DATABASE_URL"]!)
  db.pragma("busy_timeout = 5000")
  const wf = createWorkflow(db, { project_id: PROJECT_ID, name: 'Test Workflow' })
  workflowId = wf.id
  db.close()
})

// ── GET /api/workflows/[id] ───────────────────────────────────────────────────

describe('GET /api/workflows/[id]', () => {
  it('returns 200 with the workflow', async () => {
    const res = await GET(makeReq('GET', workflowId), ctx(workflowId))
    expect(res.status).toBe(200)
    const body = await res.json() as { id: string; name: string }
    expect(body.id).toBe(workflowId)
    expect(body.name).toBe('Test Workflow')
  })

  it('returns 404 for an unknown id', async () => {
    const res = await GET(makeReq('GET', UNKNOWN_ID), ctx(UNKNOWN_ID))
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Workflow not found.')
  })

  it('does not require a CSRF token', async () => {
    const res = await GET(makeReq('GET', workflowId, undefined, { token: null }), ctx(workflowId))
    expect(res.status).toBe(200)
  })
})

// ── PATCH /api/workflows/[id] ─────────────────────────────────────────────────

describe('PATCH /api/workflows/[id]', () => {
  it('updates the workflow and returns 200', async () => {
    const res = await PATCH(makeReq('PATCH', workflowId, { name: 'Renamed' }), ctx(workflowId))
    expect(res.status).toBe(200)
    const body = await res.json() as { name: string }
    expect(body.name).toBe('Renamed')
  })

  it('returns 404 for an unknown id', async () => {
    const res = await PATCH(makeReq('PATCH', UNKNOWN_ID, { name: 'x' }), ctx(UNKNOWN_ID))
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Workflow not found.')
  })

  it('returns 400 with UK English message when project_id is included in body', async () => {
    const res = await PATCH(
      makeReq('PATCH', workflowId, { project_id: PROJECT_ID, name: 'x' }),
      ctx(workflowId),
    )
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('project_id cannot be changed.')
  })

  it('returns 403 when CSRF token is missing', async () => {
    const res = await PATCH(
      makeReq('PATCH', workflowId, { name: 'x' }, { token: null }),
      ctx(workflowId),
    )
    expect(res.status).toBe(403)
  })

  it('returns 403 when CSRF token is wrong', async () => {
    const res = await PATCH(
      makeReq('PATCH', workflowId, { name: 'x' }, { token: 'bad' }),
      ctx(workflowId),
    )
    expect(res.status).toBe(403)
  })

  it('returns 422 with UK English message when name is empty', async () => {
    const res = await PATCH(makeReq('PATCH', workflowId, { name: '' }), ctx(workflowId))
    expect(res.status).toBe(422)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Name is required.')
  })

  it('returns 422 when name exceeds 200 characters', async () => {
    const res = await PATCH(makeReq('PATCH', workflowId, { name: 'x'.repeat(201) }), ctx(workflowId))
    expect(res.status).toBe(422)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Name must not exceed 200 characters.')
  })

  it('returns 422 when end_goal exceeds 2,000 characters', async () => {
    const res = await PATCH(
      makeReq('PATCH', workflowId, { end_goal: 'e'.repeat(2001) }),
      ctx(workflowId),
    )
    expect(res.status).toBe(422)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('End goal must not exceed 2,000 characters.')
  })

  it('returns 422 when due_date is not an integer', async () => {
    const res = await PATCH(makeReq('PATCH', workflowId, { due_date: 1.5 }), ctx(workflowId))
    expect(res.status).toBe(422)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Due date must be a valid timestamp.')
  })

  it('returns 400 when body is not valid JSON', async () => {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-forwarded-for': '1.1.1.1',
      'x-csrf-token': CSRF_TOKEN,
    }
    const req = new NextRequest(`http://localhost/api/workflows/${workflowId}`, {
      method: 'PATCH',
      headers,
      body: '{bad',
    })
    const res = await PATCH(req, ctx(workflowId))
    expect(res.status).toBe(400)
  })

  it('returns 429 with Retry-After after exceeding rate limit', async () => {
    const ip = freshIp()
    for (let i = 0; i < 100; i++) {
      await PATCH(makeReq('PATCH', workflowId, {}, { ip }), ctx(workflowId))
    }
    const res = await PATCH(makeReq('PATCH', workflowId, {}, { ip }), ctx(workflowId))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBeTruthy()
  })
})
