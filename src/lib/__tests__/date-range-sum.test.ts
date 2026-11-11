import { describe, it, expect } from 'vitest'
import { sumMinutesInDateRange } from '../date-utils'

/**
 * Regression tests for the UTC-vs-local date-window bug (spec §10.75).
 *
 * Session timestamps are stored as ISO/UTC strings. Naively comparing them
 * against a local date key (`s.startAt >= '2026-11-05T00:00:00'`) silently
 * drops any session that occurred before the UTC offset elapsed — in UTC+11
 * that is every session before 11:00 local, i.e. most study time.
 */
describe('sumMinutesInDateRange — timezone-correct window', () => {
  it('keeps a session whose UTC date is the day before its local date', () => {
    // Build a local-time instant at 09:00 and let the runtime serialise it.
    // In any timezone east of UTC the ISO date is the previous calendar day,
    // which is exactly the case raw-string comparison silently dropped.
    const localMorning = new Date(2026, 10, 5, 9, 0, 0) // 5 Nov 2026, 09:00 local
    const localDateKey = '2026-11-05'
    const sessions = [{ startAt: localMorning.toISOString(), durationMinutes: 60 }]

    // Logical-local comparison finds it on its local date regardless of TZ.
    expect(sumMinutesInDateRange(sessions, localDateKey, localDateKey, 0)).toBe(60)

    // And the exact pre-fix expression is what lost it, whenever the local
    // date differs from the UTC date (i.e. UTC offset > 0).
    const utcDate = localMorning.toISOString().slice(0, 10)
    if (utcDate !== localDateKey) {
      const naive = sessions
        .filter((s) => s.startAt >= localDateKey + 'T00:00:00')
        .reduce((a, s) => a + s.durationMinutes, 0)
      expect(naive).toBe(0) // the bug: real 60 minutes reported as nothing
    }
  })

  it('includes both window endpoints, excludes the day before and after', () => {
    const sessions = [
      { startAt: '2026-11-04T12:00:00.000Z', durationMinutes: 10 }, // before
      { startAt: '2026-11-05T12:00:00.000Z', durationMinutes: 20 }, // start
      { startAt: '2026-11-08T12:00:00.000Z', durationMinutes: 40 }, // middle
      { startAt: '2026-11-11T12:00:00.000Z', durationMinutes: 80 }, // end
      { startAt: '2026-11-12T12:00:00.000Z', durationMinutes: 160 }, // after
    ]
    // dayStartHour 0 → pure local calendar days.
    const total = sumMinutesInDateRange(sessions, '2026-11-05', '2026-11-11', 0)
    expect(total).toBe(20 + 40 + 80)
  })

  it('respects the logical day boundary (dayStartHour)', () => {
    // 02:00 local with dayStartHour=4 belongs to the PREVIOUS logical day.
    const early = new Date(2026, 10, 6, 2, 0, 0) // 6 Nov, 02:00 local
    const sessions = [{ startAt: early.toISOString(), durationMinutes: 30 }]
    // With a 4am day start this session belongs to 5 Nov.
    expect(sumMinutesInDateRange(sessions, '2026-11-05', '2026-11-05', 4)).toBe(30)
    expect(sumMinutesInDateRange(sessions, '2026-11-06', '2026-11-06', 4)).toBe(0)
    // With a midnight day start it belongs to 6 Nov.
    expect(sumMinutesInDateRange(sessions, '2026-11-06', '2026-11-06', 0)).toBe(30)
  })

  it('ignores invalid timestamps instead of poisoning the total with NaN', () => {
    const sessions = [
      { startAt: 'not-a-date', durationMinutes: 999 },
      { startAt: '2026-11-08T12:00:00.000Z', durationMinutes: 45 },
    ]
    expect(sumMinutesInDateRange(sessions, '2026-11-01', '2026-11-30', 0)).toBe(45)
  })

  it('returns 0 for an empty range', () => {
    expect(sumMinutesInDateRange([], '2026-11-01', '2026-11-30', 0)).toBe(0)
  })
})