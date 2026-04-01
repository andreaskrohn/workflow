import { spawn } from 'child_process'
import path from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { withCsrf } from '@/lib/middleware/csrf'

async function handler(_req: NextRequest): Promise<NextResponse> {
  spawn('bash', [path.join(process.cwd(), 'scripts', 'backup.sh')], {
    detached: true,
    stdio: 'ignore',
  }).unref()

  return NextResponse.json({ message: 'Backup started.' })
}

export const POST = withCsrf(handler)
