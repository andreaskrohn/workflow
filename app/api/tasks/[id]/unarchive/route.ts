import { NextRequest, NextResponse } from 'next/server'
import { withCsrf } from '@/lib/middleware/csrf'
import { withRateLimit } from '@/lib/middleware/rateLimit'
import { rawDb } from '@/lib/db/rawDb'
import { getTaskById, unarchiveTask } from '@/lib/db/repositories/taskRepository'

type Ctx = { params: { id: string } }

async function postHandler(_req: NextRequest, ctx?: unknown): Promise<NextResponse> {
  const { id } = (ctx as Ctx).params
  const task = getTaskById(rawDb, id)
  if (!task) return NextResponse.json({ error: 'Task not found.' }, { status: 404 })
  unarchiveTask(rawDb, id)
  return NextResponse.json(getTaskById(rawDb, id))
}

export const POST = withRateLimit(withCsrf(postHandler))
