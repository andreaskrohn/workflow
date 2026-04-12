import { NextRequest, NextResponse } from 'next/server'
import { withCsrf } from '@/lib/middleware/csrf'
import { withPayloadLimit } from '@/lib/middleware/payloadLimit'
import { withRateLimit } from '@/lib/middleware/rateLimit'
import { rawDb } from '@/lib/db/rawDb'
import { getTagsForTask, addTagToTask } from '@/lib/db/repositories/tagRepository'
import { getTaskById } from '@/lib/db/repositories/taskRepository'
import { z, ZodError } from 'zod'

type Ctx = { params: { id: string } }

const AddTagSchema = z.object({
  tagId: z
    .string()
    .min(1, 'Tag ID is required.')
    .uuid('Tag ID must be a valid UUID.'),
})

export async function GET(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { id } = ctx.params
  return NextResponse.json(getTagsForTask(rawDb, id))
}

async function postHandler(req: NextRequest, ctx?: unknown): Promise<NextResponse> {
  const { id } = (ctx as Ctx).params

  const task = getTaskById(rawDb, id)
  if (!task) {
    return NextResponse.json({ error: 'Task not found.' }, { status: 404 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  let parsed
  try {
    parsed = AddTagSchema.parse(body)
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message ?? 'Validation error.' },
        { status: 422 },
      )
    }
    throw err
  }

  const tag = rawDb.prepare('SELECT * FROM tags WHERE id = ?').get(parsed.tagId)
  if (!tag) {
    return NextResponse.json({ error: 'Tag not found.' }, { status: 404 })
  }

  try {
    addTagToTask(rawDb, id, parsed.tagId)
    return NextResponse.json(tag, { status: 201 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('UNIQUE constraint failed')) {
      return NextResponse.json(
        { error: 'Tag already assigned to this task.' },
        { status: 409 },
      )
    }
    throw err
  }
}

export const POST = withRateLimit(withPayloadLimit(withCsrf(postHandler)))
