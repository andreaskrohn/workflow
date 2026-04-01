import { NextRequest, NextResponse } from 'next/server'
import { withCsrf } from '@/lib/middleware/csrf'
import { rawDb } from '@/lib/db/rawDb'
import {
  getDependencyById,
  archiveDependency,
} from '@/lib/db/repositories/taskDependencyRepository'

type Ctx = { params: { id: string } }

async function postHandler(_req: NextRequest, ctx?: unknown): Promise<NextResponse> {
  const { id } = (ctx as Ctx).params
  const dep = getDependencyById(rawDb, id)
  if (!dep) return NextResponse.json({ error: 'Dependency not found.' }, { status: 404 })
  archiveDependency(rawDb, id)
  return NextResponse.json({ ok: true })
}

export const POST = withCsrf(postHandler)
