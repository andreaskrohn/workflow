import { NextRequest, NextResponse } from 'next/server'
import { withCsrf } from '@/lib/middleware/csrf'
import { withRateLimit } from '@/lib/middleware/rateLimit'
import { rawDb } from '@/lib/db/rawDb'
import { deleteTag } from '@/lib/db/repositories/tagRepository'

type Ctx = { params: { id: string } }

async function deleteHandler(_req: NextRequest, ctx?: unknown): Promise<NextResponse> {
  const { id } = (ctx as Ctx).params
  const deleted = deleteTag(rawDb, id)
  if (!deleted) {
    return NextResponse.json({ error: 'Tag not found.' }, { status: 404 })
  }
  return new NextResponse(null, { status: 204 })
}

export const DELETE = withRateLimit(withCsrf(deleteHandler))
