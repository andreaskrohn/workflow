import { NextRequest, NextResponse } from 'next/server'
import { withCsrf } from '@/lib/middleware/csrf'
import { withPayloadLimit } from '@/lib/middleware/payloadLimit'
import { withRateLimit } from '@/lib/middleware/rateLimit'
import { rawDb } from '@/lib/db/rawDb'
import { listTags, createTag } from '@/lib/db/repositories/tagRepository'
import { TagCreateSchema } from '@/lib/validation/tag'
import { ZodError } from 'zod'

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(listTags(rawDb))
}

async function postHandler(req: NextRequest): Promise<NextResponse> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  let parsed
  try {
    parsed = TagCreateSchema.parse(body)
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message ?? 'Validation error.' },
        { status: 422 },
      )
    }
    throw err
  }

  try {
    const tag = createTag(rawDb, parsed.name)
    return NextResponse.json(tag, { status: 201 })
  } catch (err: unknown) {
    // SQLite UNIQUE constraint violation (better-sqlite3 SqliteError extends Error,
    // but use a string-safe check in case of cross-realm instanceof edge cases).
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('UNIQUE constraint failed')) {
      return NextResponse.json(
        { error: 'A tag with that name already exists.' },
        { status: 409 },
      )
    }
    throw err
  }
}

export const POST = withRateLimit(withPayloadLimit(withCsrf(postHandler)))
