import { NextRequest, NextResponse } from 'next/server'
import { withCsrf } from '@/lib/middleware/csrf'
import { withPayloadLimit } from '@/lib/middleware/payloadLimit'
import { withRateLimit } from '@/lib/middleware/rateLimit'
import { rawDb } from '@/lib/db/rawDb'
import { reorderWorkflows } from '@/lib/db/repositories/workflowRepository'

async function postHandler(req: NextRequest): Promise<NextResponse> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  const { project_id, ordered_ids } = body as { project_id?: string; ordered_ids?: unknown }
  if (!project_id || typeof project_id !== 'string') {
    return NextResponse.json({ error: 'project_id is required.' }, { status: 422 })
  }
  if (!Array.isArray(ordered_ids) || !ordered_ids.every((id) => typeof id === 'string')) {
    return NextResponse.json({ error: 'ordered_ids must be an array of strings.' }, { status: 422 })
  }

  reorderWorkflows(rawDb, project_id, ordered_ids as string[])
  return NextResponse.json({ ok: true })
}

export const POST = withRateLimit(withPayloadLimit(withCsrf(postHandler)))
