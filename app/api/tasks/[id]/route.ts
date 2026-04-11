import { NextRequest, NextResponse } from 'next/server'
import { withCsrf } from '@/lib/middleware/csrf'
import { withPayloadLimit } from '@/lib/middleware/payloadLimit'
import { withRateLimit } from '@/lib/middleware/rateLimit'
import { rawDb } from '@/lib/db/rawDb'
import { getTaskById, updateTask } from '@/lib/db/repositories/taskRepository'
import { TaskUpdateSchema } from '@/lib/validation/task'
import { ZodError } from 'zod'

type Ctx = { params: { id: string } }

async function patchHandler(req: NextRequest, ctx?: unknown): Promise<NextResponse> {
  const { id } = (ctx as Ctx).params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  let parsed
  try {
    parsed = TaskUpdateSchema.parse(body)
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? 'Validation error.' }, { status: 422 })
    }
    throw err
  }

  const existing = getTaskById(rawDb, id)
  if (!existing) {
    return NextResponse.json({ error: 'Task not found.' }, { status: 404 })
  }

  const updated = updateTask(rawDb, id, parsed)
  return NextResponse.json(updated)
}

export const PATCH = withRateLimit(withPayloadLimit(withCsrf(patchHandler)))

export async function GET(_req: NextRequest, ctx: Ctx) {
  const task = getTaskById(rawDb, ctx.params.id)
  if (!task) return NextResponse.json({ error: 'Task not found.' }, { status: 404 })
  return NextResponse.json(task)
}
