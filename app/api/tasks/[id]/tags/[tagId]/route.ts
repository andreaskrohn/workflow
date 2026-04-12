import { NextRequest, NextResponse } from 'next/server'
import { withCsrf } from '@/lib/middleware/csrf'
import { withRateLimit } from '@/lib/middleware/rateLimit'
import { rawDb } from '@/lib/db/rawDb'
import { getTagsForTask, removeTagFromTask } from '@/lib/db/repositories/tagRepository'
import { getTaskById } from '@/lib/db/repositories/taskRepository'

type Ctx = { params: { id: string; tagId: string } }

async function deleteHandler(_req: NextRequest, ctx?: unknown): Promise<NextResponse> {
  const { id, tagId } = (ctx as Ctx).params

  const task = getTaskById(rawDb, id)
  if (!task) {
    return NextResponse.json({ error: 'Task not found.' }, { status: 404 })
  }

  const assigned = getTagsForTask(rawDb, id)
  if (!assigned.some((t) => t.id === tagId)) {
    return NextResponse.json({ error: 'Tag not assigned to this task.' }, { status: 404 })
  }

  removeTagFromTask(rawDb, id, tagId)
  return new NextResponse(null, { status: 204 })
}

export const DELETE = withRateLimit(withCsrf(deleteHandler))
