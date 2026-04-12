import { NextRequest } from 'next/server'
import { GET } from '../route'
import { resetDatabase } from '../../../../../tests/setup'
import Database from 'better-sqlite3'
import { createTask, archiveTask } from '@/lib/db/repositories/taskRepository'

// ── Helpers ───────────────────────────────────────────────────────────────────

let rlSeq = 0
const freshIp = () => `10.9.${Math.floor(++rlSeq / 256)}.${rlSeq % 256}`

function makeReq(q?: string, ip = '1.1.1.1'): NextRequest {
  const url = q !== undefined
    ? `http://localhost/api/tasks/search?q=${encodeURIComponent(q)}`
    : 'http://localhost/api/tasks/search'
  return new NextRequest(url, {
    method: 'GET',
    headers: { 'x-forwarded-for': ip },
  })
}

beforeEach(() => {
  resetDatabase()
})

// ── GET /api/tasks/search ─────────────────────────────────────────────────────

it('returns 200 with an array', async () => {
  const res = await GET(makeReq('anything'))
  expect(res.status).toBe(200)
  expect(Array.isArray(await res.json())).toBe(true)
})

it('returns matching tasks for a valid query', async () => {
  const db = new Database(process.env['DATABASE_URL']!)
  db.pragma('busy_timeout = 5000')
  createTask(db, { title: 'Solventrix deployment guide' })
  db.close()

  const res = await GET(makeReq('Solventrix'))
  const body = await res.json() as { title: string }[]
  expect(body.some((t) => t.title === 'Solventrix deployment guide')).toBe(true)
})

it('returns an empty array when no tasks match', async () => {
  const db = new Database(process.env['DATABASE_URL']!)
  db.pragma('busy_timeout = 5000')
  createTask(db, { title: 'Something completely different' })
  db.close()

  const res = await GET(makeReq('Zythonex'))
  const body = await res.json()
  expect(body).toEqual([])
})

it('returns an empty array when ?q is absent', async () => {
  const res = await GET(makeReq(undefined))
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual([])
})

it('returns an empty array when ?q is blank', async () => {
  const res = await GET(makeReq('   '))
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual([])
})

it('returns an empty array when ?q contains only special characters', async () => {
  const res = await GET(makeReq('"*()+^'))
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual([])
})

// ── Completed and archived tasks ──────────────────────────────────────────────

it('includes completed (status=done) tasks in results', async () => {
  const db = new Database(process.env['DATABASE_URL']!)
  db.pragma('busy_timeout = 5000')
  createTask(db, { title: 'Pluvionex completed task', status: 'done' })
  db.close()

  const res = await GET(makeReq('Pluvionex'))
  const body = await res.json() as { title: string }[]
  expect(body.some((t) => t.title === 'Pluvionex completed task')).toBe(true)
})

it('excludes archived tasks from results', async () => {
  const db = new Database(process.env['DATABASE_URL']!)
  db.pragma('busy_timeout = 5000')
  const task = createTask(db, { title: 'Corvathex archived task' })
  archiveTask(db, task.id)
  db.close()

  const res = await GET(makeReq('Corvathex'))
  const body = await res.json() as { title: string }[]
  expect(body.some((t) => t.title === 'Corvathex archived task')).toBe(false)
})

// ── FTS5 MATCH — sanitisation keeps queries valid ─────────────────────────────

it('does not crash when query contains FTS5 special chars (sanitised to valid query)', async () => {
  const db = new Database(process.env['DATABASE_URL']!)
  db.pragma('busy_timeout = 5000')
  createTask(db, { title: 'Nexvoran special search' })
  db.close()

  // These inputs contain FTS5 syntax chars; after sanitisation they become
  // plain tokens, so the MATCH query is still valid and finds the task.
  const res1 = await GET(makeReq('"Nexvoran"'))
  expect(res1.status).toBe(200)
  const body1 = await res1.json() as { title: string }[]
  expect(body1.some((t) => t.title === 'Nexvoran special search')).toBe(true)

  // Quoted phrase with multiple words
  const res2 = await GET(makeReq('"Nexvoran special"'))
  expect(res2.status).toBe(200)
})

it('does not crash when query contains only a * operator', async () => {
  const res = await GET(makeReq('*'))
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual([])
})

// ── CSRF ──────────────────────────────────────────────────────────────────────

it('does not require a CSRF token (GET is read-only)', async () => {
  // No X-CSRF-Token header — must still return 200
  const res = await GET(new NextRequest('http://localhost/api/tasks/search?q=test', { method: 'GET' }))
  expect(res.status).toBe(200)
})

// ── Rate limiting ─────────────────────────────────────────────────────────────

it('returns 429 with Retry-After after exceeding rate limit', async () => {
  const ip = freshIp()
  for (let i = 0; i < 100; i++) {
    await GET(makeReq('test', ip))
  }
  const res = await GET(makeReq('test', ip))
  expect(res.status).toBe(429)
  expect(res.headers.get('Retry-After')).toBeTruthy()
})
