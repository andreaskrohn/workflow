/** Formats a Date as YYYY-MM-DD in local time. */
function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Returns today's date as a YYYY-MM-DD string in local time. */
export function todayString(): string {
  return formatDate(new Date())
}

/**
 * Converts a Unix timestamp (seconds) to a YYYY-MM-DD string.
 * Returns an empty string for null.
 */
export function tsToDateInput(ts: number | null): string {
  if (ts === null) return ''
  return formatDate(new Date(ts * 1000))
}

/**
 * Converts a YYYY-MM-DD string to a Unix timestamp (seconds).
 * Returns null for empty or invalid strings.
 */
export function dateInputToTs(val: string): number | null {
  if (!val) return null
  const ms = Date.parse(val)
  if (isNaN(ms)) return null
  return Math.floor(ms / 1000)
}

/**
 * Adds `days` days to a YYYY-MM-DD base string.
 * Uses today as base when base is null.
 */
export function addDays(base: string | null, days: number): string {
  const d = base ? new Date(`${base}T00:00:00`) : new Date()
  if (!base) {
    d.setHours(0, 0, 0, 0)
  }
  d.setDate(d.getDate() + days)
  return formatDate(d)
}

/**
 * Adds `months` months to a YYYY-MM-DD base string.
 * Uses today as base when base is null.
 */
export function addMonths(base: string | null, months: number): string {
  const d = base ? new Date(`${base}T00:00:00`) : new Date()
  if (!base) {
    d.setHours(0, 0, 0, 0)
  }
  d.setMonth(d.getMonth() + months)
  return formatDate(d)
}
