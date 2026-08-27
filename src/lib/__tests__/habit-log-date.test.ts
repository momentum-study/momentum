import { describe, it, expect } from 'vitest'
import { format } from 'date-fns'

describe('habit log date filter (regression)', () => {
  it('habitLog dates are yyyy-MM-dd, not "MMM d, yyyy"', () => {
    // The bug: AI Review filtered habitLogs using startStr/endStr
    // formatted as 'MMM d, yyyy' (e.g. "Aug 21, 2026") but habitLogs
    // store dates as 'yyyy-MM-dd' (e.g. "2026-08-21").
    // String comparison of "2026-08-21" >= "Aug 21, 2026" always returns false.

    const habitLogDate = '2026-08-25'
    const filterDate = format(new Date(2026, 7, 25), 'yyyy-MM-dd') // Aug 25

    // Correct: both are yyyy-MM-dd
    expect(filterDate).toBe('2026-08-25')
    expect(habitLogDate >= filterDate).toBe(true)
    expect(habitLogDate <= filterDate).toBe(true)
  })

  it('MMM d format would cause filter to miss all logs', () => {
    const habitLogDate = '2026-08-25'
    const badFilterDate = format(new Date(2026, 7, 25), 'MMM d, yyyy') // "Aug 25, 2026"

    // This was the bug: "2026-08-25" >= "Aug 25, 2026" is a string comparison
    // '2' < 'A' in ASCII, so this is false
    expect(habitLogDate >= badFilterDate).toBe(false)
  })
})
