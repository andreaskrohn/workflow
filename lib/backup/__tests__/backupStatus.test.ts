import { isBackupNeeded, BACKUP_STALE_SECONDS } from '../backupStatus'

const NOW = 1_000_000_000 // arbitrary fixed "now"

describe('isBackupNeeded', () => {
  it('is needed when last_backup_at is null (never backed up)', () => {
    expect(isBackupNeeded(null, NOW)).toBe(true)
  })

  it('is not needed when backed up 1 hour ago', () => {
    expect(isBackupNeeded(NOW - 3600, NOW)).toBe(false)
  })

  it('is not needed when backed up exactly at the stale threshold', () => {
    // strictly greater-than, so equal is not stale
    expect(isBackupNeeded(NOW - BACKUP_STALE_SECONDS, NOW)).toBe(false)
  })

  it('is needed when backed up one second past the stale threshold', () => {
    expect(isBackupNeeded(NOW - BACKUP_STALE_SECONDS - 1, NOW)).toBe(true)
  })

  it('is needed when backed up 48 hours ago', () => {
    expect(isBackupNeeded(NOW - 48 * 3600, NOW)).toBe(true)
  })

  it('is not needed when backed up 1 second ago', () => {
    expect(isBackupNeeded(NOW - 1, NOW)).toBe(false)
  })

  it('BACKUP_STALE_SECONDS is 25 hours', () => {
    expect(BACKUP_STALE_SECONDS).toBe(25 * 60 * 60)
  })
})
