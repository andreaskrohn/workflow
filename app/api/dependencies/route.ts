import { NextRequest, NextResponse } from 'next/server'
import { withCsrf } from '@/lib/middleware/csrf'
import { withPayloadLimit } from '@/lib/middleware/payloadLimit'
import { rawDb } from '@/lib/db/rawDb'
import { createDependency } from '@/lib/db/repositories/taskDependencyRepository'
import { detectCycle, type Edge } from '@/lib/graph/detectCycle'
import { z, ZodError } from 'zod'

const CreateDependencySchema = z.object({
  task_id: z.string().uuid('task_id must be a valid UUID.'),
  depends_on_task_id: z.string().uuid('depends_on_task_id must be a valid UUID.'),
})

export async function GET(req: NextRequest) {
  const workflowId = req.nextUrl.searchParams.get('workflow_id')

  let rows: Edge[]
  if (workflowId) {
    // Return only active deps where the dependent task belongs to the given workflow.
    rows = rawDb
      .prepare(`
        SELECT d.*
        FROM task_dependencies d
        JOIN tasks t ON d.task_id = t.id
        WHERE t.workflow_id = ? AND d.archived_at IS NULL
      `)
      .all(workflowId) as Edge[]
  } else {
    rows = rawDb
      .prepare('SELECT * FROM task_dependencies WHERE archived_at IS NULL')
      .all() as Edge[]
  }

  return NextResponse.json(rows)
}

async function postHandler(req: NextRequest): Promise<NextResponse> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  let parsed
  try {
    parsed = CreateDependencySchema.parse(body)
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? 'Validation error.' }, { status: 422 })
    }
    throw err
  }

  // Cycle detection: fetch all active edges, then check in-memory.
  const allEdges = rawDb
    .prepare('SELECT task_id, depends_on_task_id, archived_at FROM task_dependencies')
    .all() as Edge[]

  if (detectCycle(allEdges, parsed.task_id, parsed.depends_on_task_id)) {
    return NextResponse.json(
      { error: 'This dependency would create a cycle.' },
      { status: 409 },
    )
  }

  try {
    const dep = createDependency(rawDb, parsed)
    return NextResponse.json(dep, { status: 201 })
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      err.message.includes('UNIQUE constraint failed')
    ) {
      return NextResponse.json({ error: 'This dependency already exists.' }, { status: 409 })
    }
    throw err
  }
}

export const POST = withPayloadLimit(withCsrf(postHandler))
