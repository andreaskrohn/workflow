import { NextResponse } from 'next/server'
import { rawDb } from '@/lib/db/rawDb'
import { isBackupNeeded } from '@/lib/backup/backupStatus'

export async function GET() {
  const row = rawDb
    .prepare('SELECT last_backup_at FROM app_settings WHERE id = 1')
    .get() as { last_backup_at: number | null } | undefined

  const lastBackupAt = row?.last_backup_at ?? null
  const needed = isBackupNeeded(lastBackupAt, Math.floor(Date.now() / 1000))

  return NextResponse.json({ needed, last_backup_at: lastBackupAt })
}
