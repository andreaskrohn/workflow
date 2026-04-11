import {
  tsToDateInput,
  dateInputToTs,
  addDays,
  addMonths,
  todayString,
} from '../dates'

describe('tsToDateInput', () => {
  it('returns empty string for null', () => {
    expect(tsToDateInput(null)).toBe('')
  })

  it('returns a YYYY-MM-DD string for a valid timestamp', () => {
    // Round-trip: whatever dateInputToTs gives us, tsToDateInput reverses it.
    const ts = dateInputToTs('2024-06-15')!
    expect(tsToDateInput(ts)).toBe('2024-06-15')
  })
})

describe('dateInputToTs', () => {
  it('returns null for an empty string', () => {
    expect(dateInputToTs('')).toBeNull()
  })

  it('returns null for an invalid date string', () => {
    expect(dateInputToTs('not-a-date')).toBeNull()
  })

  it('returns a positive integer for a valid date string', () => {
    const ts = dateInputToTs('2024-06-15')
    expect(typeof ts).toBe('number')
    expect(ts).toBeGreaterThan(0)
    expect(Number.isInteger(ts)).toBe(true)
  })
})

describe('addDays', () => {
  it('adds 1 day correctly within a month', () => {
    expect(addDays('2024-03-10', 1)).toBe('2024-03-11')
  })

  it('adds 7 days correctly', () => {
    expect(addDays('2024-03-10', 7)).toBe('2024-03-17')
  })

  it('crosses a month boundary', () => {
    expect(addDays('2024-01-31', 1)).toBe('2024-02-01')
  })

  it('uses today as base when base is null', () => {
    const result = addDays(null, 0)
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(result).toBe(todayString())
  })
})

describe('addMonths', () => {
  it('adds 1 month', () => {
    expect(addMonths('2024-03-15', 1)).toBe('2024-04-15')
  })

  it('adds 3 months', () => {
    expect(addMonths('2024-03-15', 3)).toBe('2024-06-15')
  })

  it('crosses a year boundary', () => {
    expect(addMonths('2024-10-31', 3)).toBe('2025-01-31')
  })

  it('uses today as base when base is null', () => {
    const result = addMonths(null, 0)
    expect(result).toBe(todayString())
  })
})

describe('todayString', () => {
  it('returns today in YYYY-MM-DD format', () => {
    expect(todayString()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('matches what new Date() yields in local time', () => {
    const d = new Date()
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    expect(todayString()).toBe(expected)
  })
})
