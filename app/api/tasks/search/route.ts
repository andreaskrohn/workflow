import { NextRequest, NextResponse } from 'next/server'
import { withRateLimit } from '@/lib/middleware/rateLimit'
import { rawDb } from '@/lib/db/rawDb'
import { searchTasks } from '@/lib/db/repositories/taskRepository'
import { sanitizeFtsQuery } from '@/lib/utils/fts'

async function getHandler(req: NextRequest): Promise<NextResponse> {
  const raw = req.nextUrl.searchParams.get('q') ?? ''
  const query = sanitizeFtsQuery(raw)

  if (!query) {
    return NextResponse.json([])
  }

  try {
    const tasks = searchTasks(rawDb, query)
    return NextResponse.json(tasks)
  } catch {
    // Defensive: sanitizeFtsQuery should prevent syntax errors, but if SQLite
    // still rejects the query return a clean 500 rather than crashing.
    return NextResponse.json({ error: 'Search failed.' }, { status: 500 })
  }
}

export const GET = withRateLimit(getHandler)
