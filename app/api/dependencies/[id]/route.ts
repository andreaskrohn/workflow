import { NextRequest, NextResponse } from 'next/server'
import { rawDb } from '@/lib/db/rawDb'
import { getDependencyById } from '@/lib/db/repositories/taskDependencyRepository'

type Ctx = { params: { id: string } }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const dep = getDependencyById(rawDb, ctx.params.id)
  if (!dep) return NextResponse.json({ error: 'Dependency not found.' }, { status: 404 })
  return NextResponse.json(dep)
}
