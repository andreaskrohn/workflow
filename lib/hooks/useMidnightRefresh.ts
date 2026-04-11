'use client'
import { useEffect, useRef } from 'react'

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function msUntilMidnight(): number {
  const now = new Date()
  const midnight = new Date(now)
  midnight.setHours(24, 0, 0, 0)
  return midnight.getTime() - now.getTime()
}

/**
 * Calls `onRefresh` when the calendar date changes, detected by two signals:
 *
 *  1. A `setTimeout` scheduled to fire at the next local midnight.
 *  2. A `visibilitychange` listener that fires if the tab was hidden across a
 *     date boundary (e.g. the device slept overnight).
 *
 * Both paths update an internal "last-seen date" ref so the callback is never
 * invoked more than once per calendar-day crossing.
 */
export function useMidnightRefresh(onRefresh: () => void): void {
  const lastDateRef = useRef(todayKey())
  const onRefreshRef = useRef(onRefresh)

  // Keep the ref in sync without re-running the effect.
  useEffect(() => {
    onRefreshRef.current = onRefresh
  })

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>

    function handleDateChange() {
      lastDateRef.current = todayKey()
      onRefreshRef.current()
      schedule()
    }

    function schedule() {
      timeoutId = setTimeout(handleDateChange, msUntilMidnight())
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible' && todayKey() !== lastDateRef.current) {
        lastDateRef.current = todayKey()
        onRefreshRef.current()
      }
    }

    schedule()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, []) // stable — callback changes tracked via ref
}
