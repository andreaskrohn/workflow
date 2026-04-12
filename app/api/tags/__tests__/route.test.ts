import { NextRequest } from 'next/server'
import { CSRF_TOKEN } from '@/lib/middleware/csrf'
import { GET, POST } from '../route'
import { resetDatabase } from '../../../../tests/setup'
import Database from 'better-sqlite3'
import { createTag } from '@/lib/db/repositories/tagRepository'

// ── Helpers ───────────────────────────────────────────────────────────────────

let rlSeq = 0
const freshIp = () => `10.6.${Math.floor(++rlSeq / 256)}.${rlSeq % 256}`

function makeGet(ip = '1.1.1.1'): NextRequest {
  return new NextRequest('http://localhost/api/tags', {
    method: 'GET',
    headers: { 'x-forwarded-for': ip },
  })
}

function makePost(
  body: unknown,
  { ip = '1.1.1.1', token = CSRF_TOKEN as string | null }: { ip?: string; token?: string | null } = {},
): NextRequest {
  return new NextRequest('http://localhost/api/tags', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': ip,
      ...(token !== null ? { 'X-CSRF-Token': token } : {}),
    },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  resetDatabase()
})

// ── GET /api/tags ─────────────────────────────────────────────────────────────

it('GET returns 200 with an array', async () => {
  const res = await GET(makeGet())
  expect(res.status).toBe(200)
  expect(Array.isArray(await res.json())).toBe(true)
})

it('GET returns an empty array when no tags exist', async () => {
  const res = await GET(makeGet())
  expect(await res.json()).toEqual([])
})

it('GET returns existing tags ordered by name', async () => {
  const db = new Database(process.env['DATABASE_URL']!)
  db.pragma('busy_timeout = 5000')
  createTag(db, 'zebra')
  createTag(db, 'alpha')
  db.close()

  const res = await GET(makeGet())
  const body = await res.json() as { name: string }[]
  expect(body.map((t) => t.name)).toEqual(['alpha', 'zebra'])
})

it('GET does not require a CSRF token', async () => {
  const res = await GET(
    new NextRequest('http://localhost/api/tags', { method: 'GET' }),
  )
  expect(res.status).toBe(200)
})

// ── POST /api/tags ────────────────────────────────────────────────────────────

it('POST creates a tag and returns 201', async () => {
  const res = await POST(makePost({ name: 'urgent' }))
  expect(res.status).toBe(201)
  const body = await res.json() as { id: string; name: string }
  expect(body.name).toBe('urgent')
  expect(body.id).toBeTruthy()
})

it('POST persists the tag in the database', async () => {
  await POST(makePost({ name: 'persistent' }))
  const res = await GET(makeGet())
  const tags = await res.json() as { name: string }[]
  expect(tags.some((t) => t.name === 'persistent')).toBe(true)
})

it('POST returns 422 when name is absent', async () => {
  const res = await POST(makePost({}))
  expect(res.status).toBe(422)
})

it('POST returns 422 when name is an empty string', async () => {
  const res = await POST(makePost({ name: '' }))
  expect(res.status).toBe(422)
  const body = await res.json() as { error: string }
  expect(body.error).toMatch(/required/i)
})

it('POST returns 422 when name exceeds 50 characters', async () => {
  const res = await POST(makePost({ name: 'a'.repeat(51) }))
  expect(res.status).toBe(422)
  const body = await res.json() as { error: string }
  expect(body.error).toMatch(/50/i)
})

it('POST returns 409 when name is a duplicate', async () => {
  await POST(makePost({ name: 'duplicate' }))
  const res = await POST(makePost({ name: 'duplicate' }))
  expect(res.status).toBe(409)
  const body = await res.json() as { error: string }
  expect(body.error).toMatch(/already exists/i)
})

it('POST returns 403 without CSRF token', async () => {
  const res = await POST(makePost({ name: 'no-csrf' }, { token: null }))
  expect(res.status).toBe(403)
})

it('POST returns 400 for invalid JSON', async () => {
  const req = new NextRequest('http://localhost/api/tags', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': CSRF_TOKEN as string,
    },
    body: 'not json{',
  })
  const res = await POST(req)
  expect(res.status).toBe(400)
})

// ── Rate limiting ─────────────────────────────────────────────────────────────

it('POST returns 429 after exceeding rate limit', async () => {
  const ip = freshIp()
  for (let i = 0; i < 100; i++) {
    await POST(makePost({ name: `tag-${i}` }, { ip }))
  }
  const res = await POST(makePost({ name: 'one-too-many' }, { ip }))
  expect(res.status).toBe(429)
  expect(res.headers.get('Retry-After')).toBeTruthy()
})
