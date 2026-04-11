import { NextRequest } from 'next/server'
import { CSRF_TOKEN } from '@/lib/middleware/csrf'
import { GET, POST } from '../route'
import { resetDatabase } from '../../../../tests/setup'
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
const freshIp = () => `10.5.${Math.floor(++rlSeq / 256)}.${rlSeq % 256}`

function makeReq(
  method: string,
  urlOrPath: string,
  body?: unknown,
  { ip = '1.1.1.1', token = CSRF_TOKEN as string | null }: { ip?: string; token?: string | null } = {},
): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (ip) headers['x-forwarded-for'] = ip
  if (token !== null) headers['x-csrf-token'] = token
  return new NextRequest(`http://localhost${urlOrPath}`, {
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
  workflowId = createWorkflow(db, { project_id: PROJECT_ID, name: 'Test WF' }).id
  db.close()
})

// ── GET /api/tasks ────────────────────────────────────────────────────────────

describe('GET /api/tasks', () => {
  it('returns 200 with active tasks', async () => {
    const db = new Database(process.env["DATABASE_URL"]!)
  db.pragma("busy_timeout = 5000")
    createTask(db, { title: 'Task A', workflow_id: workflowId })
    db.close()

    const res = await GET(makeReq('GET', '/api/tasks'))
    expect(res.status).toBe(200)
    const body = await res.json() as { title: string }[]
    expect(body.some((t) => t.title === 'Task A')).toBe(true)
  })

  it('returns inbox tasks when ?inbox=1', async () => {
    const db = new Database(process.env["DATABASE_URL"]!)
  db.pragma("busy_timeout = 5000")
    createTask(db, { title: 'Inbox Task', workflow_id: null })
    createTask(db, { title: 'WF Task', workflow_id: workflowId })
    db.close()

    const res = await GET(makeReq('GET', '/api/tasks?inbox=1'))
    expect(res.status).toBe(200)
    const body = await res.json() as { title: string; workflow_id: string | null }[]
    expect(body.every((t) => t.workflow_id === null)).toBe(true)
    expect(body.some((t) => t.title === 'Inbox Task')).toBe(true)
  })

  it('does not require a CSRF token', async () => {
    const res = await GET(makeReq('GET', '/api/tasks', undefined, { token: null }))
    expect(res.status).toBe(200)
  })
})

// ── POST /api/tasks ───────────────────────────────────────────────────────────

describe('POST /api/tasks', () => {
  it('creates a task and returns 201', async () => {
    const res = await POST(makeReq('POST', '/api/tasks', { workflow_id: workflowId, title: 'New Task' }))
    expect(res.status).toBe(201)
    const body = await res.json() as { title: string; workflow_id: string }
    expect(body.title).toBe('New Task')
    expect(body.workflow_id).toBe(workflowId)
  })

  it('returns 403 when CSRF token is missing', async () => {
    const res = await POST(
      makeReq('POST', '/api/tasks', { workflow_id: workflowId, title: 'x' }, { token: null }),
    )
    expect(res.status).toBe(403)
  })

  it('returns 403 when CSRF token is wrong', async () => {
    const res = await POST(
      makeReq('POST', '/api/tasks', { workflow_id: workflowId, title: 'x' }, { token: 'bad' }),
    )
    expect(res.status).toBe(403)
  })

  it('returns 422 with UK English message when title is empty', async () => {
    const res = await POST(makeReq('POST', '/api/tasks', { workflow_id: workflowId, title: '' }))
    expect(res.status).toBe(422)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Title is required.')
  })

  it('returns 422 when title exceeds 500 characters', async () => {
    const res = await POST(
      makeReq('POST', '/api/tasks', { workflow_id: workflowId, title: 't'.repeat(501) }),
    )
    expect(res.status).toBe(422)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Title must not exceed 500 characters.')
  })

  it('returns 422 with UK English message when workflow_id is not a UUID', async () => {
    const res = await POST(makeReq('POST', '/api/tasks', { workflow_id: 'bad-id', title: 'x' }))
    expect(res.status).toBe(422)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('workflow_id must be a valid UUID.')
  })

  it('returns 422 when status is invalid', async () => {
    const res = await POST(
      makeReq('POST', '/api/tasks', { workflow_id: workflowId, title: 'x', status: 'invalid' }),
    )
    expect(res.status).toBe(422)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Status must be one of: To do, Done, Blocked.')
  })

  it('returns 400 when body is not valid JSON', async () => {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-forwarded-for': '1.1.1.1',
      'x-csrf-token': CSRF_TOKEN,
    }
    const req = new NextRequest('http://localhost/api/tasks', {
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
      await POST(makeReq('POST', '/api/tasks', {}, { ip }))
    }
    const res = await POST(makeReq('POST', '/api/tasks', {}, { ip }))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBeTruthy()
  })
})
