import { NextRequest, NextResponse } from 'next/server'
import { withCsrf } from '@/lib/middleware/csrf'
import { withPayloadLimit } from '@/lib/middleware/payloadLimit'
import { rawDb } from '@/lib/db/rawDb'
import { listWorkflows, createWorkflow } from '@/lib/db/repositories/workflowRepository'
import { z, ZodError } from 'zod'

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('project_id') ?? undefined
  const workflows = listWorkflows(rawDb, { projectId })
  return NextResponse.json(workflows)
}

const CreateWorkflowSchema = z.object({
  project_id: z.string().uuid('project_id must be a valid UUID.'),
  name: z
    .string()
    .min(1, 'Name is required.')
    .max(200, 'Name must not exceed 200 characters.'),
  end_goal: z
    .string()
    .max(2000, 'End goal must not exceed 2,000 characters.')
    .nullable()
    .optional(),
})

async function postHandler(req: NextRequest): Promise<NextResponse> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  let parsed
  try {
    parsed = CreateWorkflowSchema.parse(body)
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? 'Validation error.' }, { status: 422 })
    }
    throw err
  }

  const workflow = createWorkflow(rawDb, parsed)
  return NextResponse.json(workflow, { status: 201 })
}

export const POST = withPayloadLimit(withCsrf(postHandler))
