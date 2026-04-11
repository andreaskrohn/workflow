import { NextRequest, NextResponse } from 'next/server'
import { withCsrf } from '@/lib/middleware/csrf'
import { withRateLimit } from '@/lib/middleware/rateLimit'
import { rawDb } from '@/lib/db/rawDb'
import { getWorkflowById, archiveWorkflowWithTasks } from '@/lib/db/repositories/workflowRepository'

type Ctx = { params: { id: string } }

async function postHandler(req: NextRequest, ctx?: unknown): Promise<NextResponse> {
  const { id } = (ctx as Ctx).params

  const workflow = getWorkflowById(rawDb, id)
  if (!workflow) {
    return NextResponse.json({ error: 'Workflow not found.' }, { status: 404 })
  }
  if (workflow.archived_at != null) {
    return NextResponse.json({ error: 'Workflow is already archived.' }, { status: 409 })
  }

  archiveWorkflowWithTasks(rawDb, id)
  return NextResponse.json({ archived: true })
}

export const POST = withRateLimit(withCsrf(postHandler))
