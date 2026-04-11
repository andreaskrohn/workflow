import { NextRequest, NextResponse } from 'next/server'
import { withCsrf } from '@/lib/middleware/csrf'
import { withPayloadLimit } from '@/lib/middleware/payloadLimit'
import { rawDb } from '@/lib/db/rawDb'
import { listTasks, createTask } from '@/lib/db/repositories/taskRepository'
import { TaskCreateSchema } from '@/lib/validation/task'
import { ZodError } from 'zod'

export async function GET(req: NextRequest) {
  const workflowId = req.nextUrl.searchParams.get('workflow_id') ?? undefined
  const inbox = req.nextUrl.searchParams.get('inbox') === '1'
  const tasks = listTasks(rawDb, { workflowId, inbox })
  return NextResponse.json(tasks)
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
    parsed = TaskCreateSchema.parse(body)
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? 'Validation error.' }, { status: 422 })
    }
    throw err
  }

  const task = createTask(rawDb, parsed)
  return NextResponse.json(task, { status: 201 })
}

export const POST = withPayloadLimit(withCsrf(postHandler))
