import { NextResponse } from 'next/server'
import { withRateLimit } from '@/lib/middleware/rateLimit'
import { rawDb } from '@/lib/db/rawDb'
import { listWorkflowsDueForReview } from '@/lib/db/repositories/reviewRepository'

async function getHandler(): Promise<NextResponse> {
  return NextResponse.json(listWorkflowsDueForReview(rawDb))
}

export const GET = withRateLimit(getHandler)
