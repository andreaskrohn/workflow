import { NextRequest, NextResponse } from 'next/server'
import { withCsrf } from '@/lib/middleware/csrf'
import { withPayloadLimit } from '@/lib/middleware/payloadLimit'
import { rawDb } from '@/lib/db/rawDb'
import { listProjects, createProject } from '@/lib/db/repositories/projectRepository'

const DEFAULT_SPACE_ID = '00000000-0000-0000-0000-000000000001'

export async function GET(req: NextRequest) {
  const spaceId = req.nextUrl.searchParams.get('space_id') ?? undefined
  const projects = listProjects(rawDb, { spaceId })
  return NextResponse.json(projects)
}

async function postHandler(req: NextRequest): Promise<NextResponse> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }
  const { name } = body as { name?: string }
  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Name is required.' }, { status: 422 })
  }
  if (name.trim().length > 200) {
    return NextResponse.json({ error: 'Name must not exceed 200 characters.' }, { status: 422 })
  }
  const project = createProject(rawDb, { space_id: DEFAULT_SPACE_ID, name: name.trim() })
  return NextResponse.json(project, { status: 201 })
}

export const POST = withPayloadLimit(withCsrf(postHandler))
