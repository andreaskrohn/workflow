import { NextRequest } from 'next/server'
import { CSRF_TOKEN } from '@/lib/middleware/csrf'
import { GET, POST } from '../route'
import { resetDatabase } from '../../../../tests/setup'
import Database from 'better-sqlite3'
import { createWorkflow } from '@/lib/db/repositories/workflowRepository'
import { randomUUID } from 'crypto'

// ── Test-DB project setup ─────────────────────────────────────────────────────
// Seeded IDs (00000000-...) fail Zod's strict UUID validation (version digit
// must be 1–8), so we insert a space + project with real UUIDs once per file.

let PROJECT_ID: string

beforeAll(() => {
  const spaceId = randomUUID()
  PROJECT_ID = randomUUID()
  const db = new Database(process.env["DATABASE_URL"]!)
  db.pragma("busy_timeout = 5000")
  db.pragma('foreign_keys = OFF')
  const now = Math.floor(Date.now() / 1000)
  db.prepare('INSERT INTO spaces (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(spaceId, 'Test Space', now, now)
  db.prepare('INSERT INTO projects (id, space_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(PROJECT_ID, spaceId, 'Test Project', now, now)
  db.pragma('foreign_keys = ON')
  db.close()
})

// ── Helpers ───────────────────────────────────────────────────────────────────

let rlSeq = 0
const freshIp = () => `10.1.${Math.floor(++rlSeq / 256)}.${rlSeq % 256}`

function makeReq(
  method: string,
  body?: unknown,
  { ip = '1.1.1.1', token = CSRF_TOKEN as string | null }: { ip?: string; token?: string | null } = {},
): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (ip) headers['x-forwarded-for'] = ip
  if (token !== null) headers['x-csrf-token'] = token
  return new NextRequest('http://localhost/api/workflows', {
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

beforeEach(resetAll)

// ── GET /api/workflows ────────────────────────────────────────────────────────

describe('GET /api/workflows', () => {
  it('returns 200 with all active workflows', async () => {
    const db = new Database(process.env["DATABASE_URL"]!)
  db.pragma("busy_timeout = 5000")
    createWorkflow(db, { project_id: PROJECT_ID, name: 'Alpha' })
    createWorkflow(db, { project_id: PROJECT_ID, name: 'Beta' })
    db.close()

    const res = await GET(makeReq('GET'))
    expect(res.status).toBe(200)
    const body = await res.json() as { name: string }[]
    const names = body.map((w) => w.name)
    expect(names).toContain('Alpha')
    expect(names).toContain('Beta')
  })

  it('filters by project_id query parameter', async () => {
    const db = new Database(process.env["DATABASE_URL"]!)
  db.pragma("busy_timeout = 5000")
    createWorkflow(db, { project_id: PROJECT_ID, name: 'In Project' })
    db.close()

    const url = `http://localhost/api/workflows?project_id=${PROJECT_ID}`
    const res = await GET(new NextRequest(url, { method: 'GET' }))
    expect(res.status).toBe(200)
    const body = await res.json() as { name: string }[]
    expect(body.some((w) => w.name === 'In Project')).toBe(true)
  })

  it('does not require a CSRF token', async () => {
    const res = await GET(makeReq('GET', undefined, { token: null }))
    expect(res.status).toBe(200)
  })
})

// ── POST /api/workflows ───────────────────────────────────────────────────────

describe('POST /api/workflows', () => {
  it('creates a workflow and returns 201', async () => {
    const res = await POST(makeReq('POST', { project_id: PROJECT_ID, name: 'New Workflow' }))
    expect(res.status).toBe(201)
    const body = await res.json() as { name: string; project_id: string }
    expect(body.name).toBe('New Workflow')
    expect(body.project_id).toBe(PROJECT_ID)
  })

  it('returns 403 when CSRF token is missing', async () => {
    const res = await POST(makeReq('POST', { project_id: PROJECT_ID, name: 'x' }, { token: null }))
    expect(res.status).toBe(403)
  })

  it('returns 403 when CSRF token is wrong', async () => {
    const res = await POST(makeReq('POST', { project_id: PROJECT_ID, name: 'x' }, { token: 'bad' }))
    expect(res.status).toBe(403)
  })

  it('returns 422 with UK English message when name is missing', async () => {
    const res = await POST(makeReq('POST', { project_id: PROJECT_ID, name: '' }))
    expect(res.status).toBe(422)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Name is required.')
  })

  it('returns 422 when name exceeds 200 characters', async () => {
    const res = await POST(makeReq('POST', { project_id: PROJECT_ID, name: 'x'.repeat(201) }))
    expect(res.status).toBe(422)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Name must not exceed 200 characters.')
  })

  it('returns 422 with UK English message when project_id is not a UUID', async () => {
    const res = await POST(makeReq('POST', { project_id: 'not-a-uuid', name: 'x' }))
    expect(res.status).toBe(422)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('project_id must be a valid UUID.')
  })

  it('returns 422 when end_goal exceeds 2,000 characters', async () => {
    const res = await POST(makeReq('POST', { project_id: PROJECT_ID, name: 'x', end_goal: 'e'.repeat(2001) }))
    expect(res.status).toBe(422)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('End goal must not exceed 2,000 characters.')
  })

  it('returns 400 when body is not valid JSON', async () => {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-forwarded-for': '1.1.1.1',
      'x-csrf-token': CSRF_TOKEN,
    }
    const req = new NextRequest('http://localhost/api/workflows', {
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
      await POST(makeReq('POST', {}, { ip }))
    }
    const res = await POST(makeReq('POST', {}, { ip }))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBeTruthy()
  })
})
