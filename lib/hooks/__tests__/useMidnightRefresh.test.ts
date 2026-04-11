/** @jest-environment jsdom */
import { renderHook } from '@testing-library/react'
import { act } from 'react'
import { useMidnightRefresh } from '../useMidnightRefresh'

// Compute the next LOCAL midnight using the real clock before fake timers take
// over, so msUntilMidnight() inside the hook sees a stable, small value.
let nextMidnight: number

beforeEach(() => {
  const d = new Date()
  d.setHours(24, 0, 0, 0) // next local midnight
  nextMidnight = d.getTime()

  jest.useFakeTimers()
  jest.setSystemTime(nextMidnight - 2_000) // start 2 s before midnight
})

afterEach(() => {
  jest.useRealTimers()
})

// ── 1. Fires on date change (midnight timer) ──────────────────────────────────

it('calls onRefresh when the midnight timer fires', () => {
  const onRefresh = jest.fn()
  renderHook(() => useMidnightRefresh(onRefresh))

  expect(onRefresh).not.toHaveBeenCalled()

  // Advance 2 s + 1 ms: crosses midnight, timer callback executes
  act(() => { jest.advanceTimersByTime(2_001) })

  expect(onRefresh).toHaveBeenCalledTimes(1)
})

// ── 2. Fires on visibilitychange when the date has changed ───────────────────

it('calls onRefresh on visibilitychange only when the date has changed', () => {
  const onRefresh = jest.fn()
  renderHook(() => useMidnightRefresh(onRefresh))

  // Same day — no call
  act(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  expect(onRefresh).not.toHaveBeenCalled()

  // Jump the clock to 30 s after midnight (new date) without triggering timers
  act(() => { jest.setSystemTime(nextMidnight + 30_000) })

  // Tab becomes visible — date has changed
  act(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  expect(onRefresh).toHaveBeenCalledTimes(1)
})

// ── 3. Does not double-fire when visibilitychange follows the midnight timer ──

it('does not call onRefresh twice when visibilitychange fires after the midnight timer already fired', () => {
  const onRefresh = jest.fn()
  renderHook(() => useMidnightRefresh(onRefresh))

  // Timer fires and advances Date past midnight
  act(() => { jest.advanceTimersByTime(2_001) })
  expect(onRefresh).toHaveBeenCalledTimes(1)

  // visibilitychange: lastDateRef already updated by the timer — no second call
  act(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  expect(onRefresh).toHaveBeenCalledTimes(1)
})

// ── 4. Cleans up on unmount ───────────────────────────────────────────────────

it('does not call onRefresh after the hook unmounts', () => {
  const onRefresh = jest.fn()
  const { unmount } = renderHook(() => useMidnightRefresh(onRefresh))

  unmount()

  act(() => { jest.advanceTimersByTime(2_001) })
  act(() => {
    jest.setSystemTime(nextMidnight + 30_000)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })

  expect(onRefresh).not.toHaveBeenCalled()
})
