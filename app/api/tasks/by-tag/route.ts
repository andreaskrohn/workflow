import { NextRequest, NextResponse } from 'next/server'
import { withRateLimit } from '@/lib/middleware/rateLimit'
import { rawDb } from '@/lib/db/rawDb'
import { listTasksByTags } from '@/lib/db/repositories/taggedTasksRepository'

async function getHandler(req: NextRequest): Promise<NextResponse> {
  const raw = req.nextUrl.searchParams.get('tags') ?? ''
  const tagIds = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  return NextResponse.json(listTasksByTags(rawDb, tagIds))
}

export const GET = withRateLimit(getHandler)
