export const BACKUP_STALE_SECONDS = 25 * 60 * 60 // 25 hours

/**
 * Returns true if a backup is needed.
 * A backup is needed if it has never run (null) or the last run was more than
 * BACKUP_STALE_SECONDS ago.
 */
export function isBackupNeeded(lastBackupAt: number | null, nowSeconds: number): boolean {
  if (lastBackupAt === null) return true
  return nowSeconds - lastBackupAt > BACKUP_STALE_SECONDS
}
