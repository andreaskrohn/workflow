import { NextResponse } from 'next/server'
import { withRateLimit } from '@/lib/middleware/rateLimit'
import { rawDb } from '@/lib/db/rawDb'
import { listCompletedTasks } from '@/lib/db/repositories/taskRepository'

async function getHandler(): Promise<NextResponse> {
  return NextResponse.json(listCompletedTasks(rawDb))
}

export const GET = withRateLimit(getHandler)
