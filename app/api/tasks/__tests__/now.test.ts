import { NextRequest } from 'next/server'
import { GET } from '../now/route'
import { resetDatabase } from '../../../../tests/setup'
import Database from 'better-sqlite3'
import { createTask } from '@/lib/db/repositories/taskRepository'

function resetAll() {
  resetDatabase()
}

beforeEach(resetAll)

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/tasks/now', { method: 'GET' })
}

// ── GET /api/tasks/now ────────────────────────────────────────────────────────

it('returns 200 with an array', async () => {
  const res = await GET()
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(Array.isArray(body)).toBe(true)
})

it('returns inbox tasks that are active and not deferred', async () => {
  const db = new Database(process.env["DATABASE_URL"]!)
  db.pragma("busy_timeout = 5000")
  createTask(db, { title: 'Now task', workflow_id: null, status: 'todo', defer_date: null })
  db.close()

  const res = await GET()
  const body = await res.json() as { title: string }[]
  expect(body.some((t) => t.title === 'Now task')).toBe(true)
})

it('excludes tasks deferred into the future', async () => {
  const db = new Database(process.env["DATABASE_URL"]!)
  db.pragma("busy_timeout = 5000")
  const futureTs = Math.floor(Date.now() / 1000) + 86400 * 30
  createTask(db, { title: 'Deferred task', workflow_id: null, defer_date: futureTs })
  db.close()

  const res = await GET()
  const body = await res.json() as { title: string }[]
  expect(body.every((t) => t.title !== 'Deferred task')).toBe(true)
})

it('excludes archived tasks', async () => {
  const db = new Database(process.env["DATABASE_URL"]!)
  db.pragma("busy_timeout = 5000")
  const { archiveTask } = await import('@/lib/db/repositories/taskRepository')
  const task = createTask(db, { title: 'Archived task', workflow_id: null })
  archiveTask(db, task.id)
  db.close()

  const res = await GET()
  const body = await res.json() as { title: string }[]
  expect(body.every((t) => t.title !== 'Archived task')).toBe(true)
})

it('does not require a CSRF token', async () => {
  const res = await GET()
  expect(res.status).toBe(200)
})

void makeReq // silence lint — makeReq unused after refactor
