import { NextRequest } from 'next/server'
import { CSRF_TOKEN } from '@/lib/middleware/csrf'
import { GET, PATCH } from '../route'
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

const UNKNOWN_ID = randomUUID()

let rlSeq = 0
const freshIp = () => `10.6.${Math.floor(++rlSeq / 256)}.${rlSeq % 256}`

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
  return new NextRequest(`http://localhost/api/tasks/${id}`, {
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
let taskId: string

beforeEach(() => {
  resetAll()
  const db = new Database(process.env["DATABASE_URL"]!)
  db.pragma("busy_timeout = 5000")
  workflowId = createWorkflow(db, { project_id: PROJECT_ID, name: 'Test WF' }).id
  taskId = createTask(db, { title: 'Test Task', workflow_id: workflowId }).id
  db.close()
})

// ── GET /api/tasks/[id] ───────────────────────────────────────────────────────

describe('GET /api/tasks/[id]', () => {
  it('returns 200 with the task', async () => {
    const res = await GET(makeReq('GET', taskId), ctx(taskId))
    expect(res.status).toBe(200)
    const body = await res.json() as { id: string; title: string }
    expect(body.id).toBe(taskId)
    expect(body.title).toBe('Test Task')
  })

  it('returns 404 for an unknown id', async () => {
    const res = await GET(makeReq('GET', UNKNOWN_ID), ctx(UNKNOWN_ID))
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Task not found.')
  })

  it('does not require a CSRF token', async () => {
    const res = await GET(makeReq('GET', taskId, undefined, { token: null }), ctx(taskId))
    expect(res.status).toBe(200)
  })
})

// ── PATCH /api/tasks/[id] ─────────────────────────────────────────────────────

describe('PATCH /api/tasks/[id]', () => {
  it('updates the task and returns 200', async () => {
    const res = await PATCH(makeReq('PATCH', taskId, { title: 'Updated' }), ctx(taskId))
    expect(res.status).toBe(200)
    const body = await res.json() as { title: string }
    expect(body.title).toBe('Updated')
  })

  it('can assign an inbox task to a workflow by patching workflow_id', async () => {
    const db = new Database(process.env["DATABASE_URL"]!)
  db.pragma("busy_timeout = 5000")
    const inboxTask = createTask(db, { title: 'Inbox', workflow_id: null })
    db.close()

    const res = await PATCH(
      makeReq('PATCH', inboxTask.id, { workflow_id: workflowId }),
      ctx(inboxTask.id),
    )
    expect(res.status).toBe(200)
    const body = await res.json() as { workflow_id: string }
    expect(body.workflow_id).toBe(workflowId)
  })

  it('returns 404 for an unknown id', async () => {
    const res = await PATCH(makeReq('PATCH', UNKNOWN_ID, { title: 'x' }), ctx(UNKNOWN_ID))
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Task not found.')
  })

  it('returns 403 when CSRF token is missing', async () => {
    const res = await PATCH(makeReq('PATCH', taskId, { title: 'x' }, { token: null }), ctx(taskId))
    expect(res.status).toBe(403)
  })

  it('returns 403 when CSRF token is wrong', async () => {
    const res = await PATCH(makeReq('PATCH', taskId, { title: 'x' }, { token: 'bad' }), ctx(taskId))
    expect(res.status).toBe(403)
  })

  it('returns 422 with UK English message when title is empty', async () => {
    const res = await PATCH(makeReq('PATCH', taskId, { title: '' }), ctx(taskId))
    expect(res.status).toBe(422)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Title is required.')
  })

  it('returns 422 when title exceeds 500 characters', async () => {
    const res = await PATCH(makeReq('PATCH', taskId, { title: 't'.repeat(501) }), ctx(taskId))
    expect(res.status).toBe(422)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Title must not exceed 500 characters.')
  })

  it('returns 422 with UK English message when workflow_id is not a UUID', async () => {
    const res = await PATCH(makeReq('PATCH', taskId, { workflow_id: 'not-a-uuid' }), ctx(taskId))
    expect(res.status).toBe(422)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('workflow_id must be a valid UUID.')
  })

  it('returns 422 when status is invalid', async () => {
    const res = await PATCH(makeReq('PATCH', taskId, { status: 'invalid' }), ctx(taskId))
    expect(res.status).toBe(422)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Status must be one of: To do, Done, Blocked.')
  })

  it('returns 422 when priority is out of range', async () => {
    const res = await PATCH(makeReq('PATCH', taskId, { priority: 6 }), ctx(taskId))
    expect(res.status).toBe(422)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Priority must be between 1 and 5.')
  })

  it('returns 422 when due_date is not an integer', async () => {
    const res = await PATCH(makeReq('PATCH', taskId, { due_date: 1.5 }), ctx(taskId))
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
    const req = new NextRequest(`http://localhost/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers,
      body: '{bad',
    })
    const res = await PATCH(req, ctx(taskId))
    expect(res.status).toBe(400)
  })

  it('returns 429 with Retry-After after exceeding rate limit', async () => {
    const ip = freshIp()
    for (let i = 0; i < 100; i++) {
      await PATCH(makeReq('PATCH', taskId, {}, { ip }), ctx(taskId))
    }
    const res = await PATCH(makeReq('PATCH', taskId, {}, { ip }), ctx(taskId))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBeTruthy()
  })
})
