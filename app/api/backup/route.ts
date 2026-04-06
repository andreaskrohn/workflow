import { spawn } from 'child_process'
import path from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { withCsrf } from '@/lib/middleware/csrf'
import { rawDb } from '@/lib/db/rawDb'

async function handler(_req: NextRequest): Promise<NextResponse> {
  const child = spawn('bash', [path.join(process.cwd(), 'scripts', 'backup.sh')], {
    detached: true,
    stdio: 'ignore',
  })
  child.on('close', (code) => {
    if (code === 0) {
      rawDb
        .prepare('UPDATE app_settings SET last_backup_at = ? WHERE id = 1')
        .run(Math.floor(Date.now() / 1000))
    }
  })
  child.unref()

  return NextResponse.json({ message: 'Backup started.' })
}

export const POST = withCsrf(handler)
