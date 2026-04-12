import { NextRequest } from 'next/server'
import { CSRF_TOKEN } from '@/lib/middleware/csrf'
import { DELETE } from '../route'
import { resetDatabase } from '../../../../../tests/setup'
import Database from 'better-sqlite3'
import { createTag, listTags } from '@/lib/db/repositories/tagRepository'
import { randomUUID } from 'crypto'

// ── Helpers ───────────────────────────────────────────────────────────────────

let rlSeq = 0
const freshIp = () => `10.7.${Math.floor(++rlSeq / 256)}.${rlSeq % 256}`

const UNKNOWN_ID = randomUUID()

function ctx(id: string) {
  return { params: { id } }
}

function makeDelete(
  id: string,
  { ip = '1.1.1.1', token = CSRF_TOKEN as string | null }: { ip?: string; token?: string | null } = {},
): [NextRequest, { params: { id: string } }] {
  return [
    new NextRequest(`http://localhost/api/tags/${id}`, {
      method: 'DELETE',
      headers: {
        'x-forwarded-for': ip,
        ...(token !== null ? { 'X-CSRF-Token': token } : {}),
      },
    }),
    ctx(id),
  ]
}

beforeEach(() => {
  resetDatabase()
})

// ── DELETE /api/tags/[id] ─────────────────────────────────────────────────────

it('DELETE returns 204 when the tag exists', async () => {
  const db = new Database(process.env['DATABASE_URL']!)
  db.pragma('busy_timeout = 5000')
  const tag = createTag(db, 'to-delete')
  db.close()

  const res = await DELETE(...makeDelete(tag.id))
  expect(res.status).toBe(204)
})

it('DELETE removes the tag from the database', async () => {
  const db = new Database(process.env['DATABASE_URL']!)
  db.pragma('busy_timeout = 5000')
  const tag = createTag(db, 'gone')
  db.close()

  await DELETE(...makeDelete(tag.id))

  const db2 = new Database(process.env['DATABASE_URL']!)
  db2.pragma('busy_timeout = 5000')
  expect(listTags(db2).map((t) => t.id)).not.toContain(tag.id)
  db2.close()
})

it('DELETE returns 404 when the tag does not exist', async () => {
  const res = await DELETE(...makeDelete(UNKNOWN_ID))
  expect(res.status).toBe(404)
  const body = await res.json() as { error: string }
  expect(body.error).toMatch(/not found/i)
})

it('DELETE returns 403 without CSRF token', async () => {
  const db = new Database(process.env['DATABASE_URL']!)
  db.pragma('busy_timeout = 5000')
  const tag = createTag(db, 'csrf-test')
  db.close()

  const res = await DELETE(...makeDelete(tag.id, { token: null }))
  expect(res.status).toBe(403)
})

// ── Rate limiting ─────────────────────────────────────────────────────────────

it('DELETE returns 429 after exceeding rate limit', async () => {
  const ip = freshIp()
  const db = new Database(process.env['DATABASE_URL']!)
  db.pragma('busy_timeout = 5000')
  const tag = createTag(db, 'rate-limit-target')
  db.close()

  for (let i = 0; i < 100; i++) {
    await DELETE(...makeDelete(UNKNOWN_ID, { ip }))
  }
  const res = await DELETE(...makeDelete(tag.id, { ip }))
  expect(res.status).toBe(429)
  expect(res.headers.get('Retry-After')).toBeTruthy()
})
