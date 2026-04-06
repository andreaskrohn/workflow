import { NextRequest, NextResponse } from 'next/server'
import { withCsrf } from '@/lib/middleware/csrf'
import { withPayloadLimit } from '@/lib/middleware/payloadLimit'
import { rawDb } from '@/lib/db/rawDb'
import { getWorkflowById, updateWorkflow } from '@/lib/db/repositories/workflowRepository'
import { z, ZodError } from 'zod'

type Ctx = { params: { id: string } }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const workflow = getWorkflowById(rawDb, ctx.params.id)
  if (!workflow) {
    return NextResponse.json({ error: 'Workflow not found.' }, { status: 404 })
  }
  return NextResponse.json(workflow)
}

const UpdateWorkflowSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required.')
    .max(200, 'Name must not exceed 200 characters.')
    .optional(),
  end_goal: z
    .string()
    .max(2000, 'End goal must not exceed 2,000 characters.')
    .nullable()
    .optional(),
  due_date: z
    .number()
    .int('Due date must be a valid timestamp.')
    .nullable()
    .optional(),
  archived_at: z
    .number()
    .int()
    .nullable()
    .optional(),
  eg_position_x: z.number().nullable().optional(),
  eg_position_y: z.number().nullable().optional(),
})

async function patchHandler(req: NextRequest, ctx?: unknown): Promise<NextResponse> {
  const { id } = (ctx as Ctx).params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  let parsed
  try {
    parsed = UpdateWorkflowSchema.parse(body)
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? 'Validation error.' }, { status: 422 })
    }
    throw err
  }

  const workflow = updateWorkflow(rawDb, id, parsed)
  if (!workflow) {
    return NextResponse.json({ error: 'Workflow not found.' }, { status: 404 })
  }
  return NextResponse.json(workflow)
}

export const PATCH = withPayloadLimit(withCsrf(patchHandler))
