import { NextRequest } from 'next/server'
import { CSRF_TOKEN } from '@/lib/middleware/csrf'
import { POST as archivePost } from '../archive/route'
import { POST as unarchivePost } from '../unarchive/route'
import { resetDatabase } from '../../../../../tests/setup'
import Database from 'better-sqlite3'
import { createWorkflow } from '@/lib/db/repositories/workflowRepository'
import { createTask, getTaskById } from '@/lib/db/repositories/taskRepository'
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
const freshIp = () => `10.7.${Math.floor(++rlSeq / 256)}.${rlSeq % 256}`

function ctx(id: string) {
  return { params: { id } }
}

function makeArchiveReq(
  id: string,
  { ip = '1.1.1.1', token = CSRF_TOKEN as string | null }: { ip?: string; token?: string | null } = {},
): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (ip) headers['x-forwarded-for'] = ip
  if (token !== null) headers['x-csrf-token'] = token
  return new NextRequest(`http://localhost/api/tasks/${id}/archive`, { method: 'POST', headers })
}

function makeUnarchiveReq(
  id: string,
  { ip = '1.1.1.1', token = CSRF_TOKEN as string | null }: { ip?: string; token?: string | null } = {},
): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (ip) headers['x-forwarded-for'] = ip
  if (token !== null) headers['x-csrf-token'] = token
  return new NextRequest(`http://localhost/api/tasks/${id}/unarchive`, { method: 'POST', headers })
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
  taskId = createTask(db, { title: 'Archivable', workflow_id: wfId }).id
  db.close()
})

// ── POST /api/tasks/[id]/archive ──────────────────────────────────────────────

describe('POST /api/tasks/[id]/archive', () => {
  it('archives the task and returns { ok: true }', async () => {
    const res = await archivePost(makeArchiveReq(taskId), ctx(taskId))
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean }
    expect(body.ok).toBe(true)

    const db = new Database(process.env["DATABASE_URL"]!)
  db.pragma("busy_timeout = 5000")
    const task = getTaskById(db, taskId)
    db.close()
    expect(task?.archived_at).not.toBeNull()
  })

  it('returns 404 for an unknown task id', async () => {
    const res = await archivePost(makeArchiveReq(UNKNOWN_ID), ctx(UNKNOWN_ID))
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Task not found.')
  })

  it('returns 403 when CSRF token is missing', async () => {
    const res = await archivePost(makeArchiveReq(taskId, { token: null }), ctx(taskId))
    expect(res.status).toBe(403)
  })

  it('returns 403 when CSRF token is wrong', async () => {
    const res = await archivePost(makeArchiveReq(taskId, { token: 'bad' }), ctx(taskId))
    expect(res.status).toBe(403)
  })

  it('returns 429 with Retry-After after exceeding rate limit', async () => {
    const ip = freshIp()
    for (let i = 0; i < 100; i++) {
      await archivePost(makeArchiveReq(UNKNOWN_ID, { ip }), ctx(UNKNOWN_ID))
    }
    const res = await archivePost(makeArchiveReq(UNKNOWN_ID, { ip }), ctx(UNKNOWN_ID))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBeTruthy()
  })
})

// ── POST /api/tasks/[id]/unarchive ────────────────────────────────────────────

describe('POST /api/tasks/[id]/unarchive', () => {
  it('unarchives an archived task and returns the updated task', async () => {
    await archivePost(makeArchiveReq(taskId), ctx(taskId))

    const res = await unarchivePost(makeUnarchiveReq(taskId), ctx(taskId))
    expect(res.status).toBe(200)
    const body = await res.json() as { archived_at: number | null }
    expect(body.archived_at).toBeNull()
  })

  it('returns 404 for an unknown task id', async () => {
    const res = await unarchivePost(makeUnarchiveReq(UNKNOWN_ID), ctx(UNKNOWN_ID))
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Task not found.')
  })

  it('returns 403 when CSRF token is missing', async () => {
    const res = await unarchivePost(makeUnarchiveReq(taskId, { token: null }), ctx(taskId))
    expect(res.status).toBe(403)
  })

  it('returns 403 when CSRF token is wrong', async () => {
    const res = await unarchivePost(makeUnarchiveReq(taskId, { token: 'bad' }), ctx(taskId))
    expect(res.status).toBe(403)
  })

  it('returns 429 with Retry-After after exceeding rate limit', async () => {
    const ip = freshIp()
    for (let i = 0; i < 100; i++) {
      await unarchivePost(makeUnarchiveReq(UNKNOWN_ID, { ip }), ctx(UNKNOWN_ID))
    }
    const res = await unarchivePost(makeUnarchiveReq(UNKNOWN_ID, { ip }), ctx(UNKNOWN_ID))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBeTruthy()
  })
})
