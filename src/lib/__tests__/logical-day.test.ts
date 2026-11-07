import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeDayStartHour, toLogicalDateString } from '../date-utils'

// Pin to UTC so local-hour math is deterministic.
vi.stubEnv('TZ', 'UTC')

afterEach(() => {
  vi.unstubAllEnvs()
  vi.stubEnv('TZ', 'UTC')
})

describe('normalizeDayStartHour', () => {
  it('keeps valid values', () => {
    expect(normalizeDayStartHour(0)).toBe(0)
    expect(normalizeDayStartHour(4)).toBe(4)
    expect(normalizeDayStartHour(23)).toBe(23)
  })

  it('clamps out-of-range and malformed values to midnight', () => {
    expect(normalizeDayStartHour(-1)).toBe(0)
    expect(normalizeDayStartHour(24)).toBe(23)
    expect(normalizeDayStartHour(2.7)).toBe(2)
    expect(normalizeDayStartHour(Number.NaN)).toBe(0)
    expect(normalizeDayStartHour(undefined)).toBe(0)
    expect(normalizeDayStartHour(null)).toBe(0)
  })
})

describe('toLogicalDateString', () => {
  it('matches the calendar day when dayStartHour is midnight', () => {
    const t = '2026-11-07T02:30:00Z'
    expect(toLogicalDateString(t, 0)).toBe('2026-11-07')
  })

  it('rolls pre-dawn timestamps back to the previous day', () => {
    // 02:30 local with a 4am day start → belongs to the previous day.
    const t = '2026-11-07T02:30:00Z'
    expect(toLogicalDateString(t, 4)).toBe('2026-11-06')
  })

  it('does not roll back timestamps at or after the day start', () => {
    // 04:00 exactly is already the new day.
    const t = '2026-11-07T04:00:00Z'
    expect(toLogicalDateString(t, 4)).toBe('2026-11-07')
    expect(toLogicalDateString('2026-11-07T09:00:00Z', 4)).toBe('2026-11-07')
  })

  it('rolls back far enough to cross a month boundary', () => {
    const t = '2026-11-01T01:30:00Z'
    expect(toLogicalDateString(t, 3)).toBe('2026-10-31')
  })

  it('rolls back far enough to cross a year boundary', () => {
    const t = '2026-01-01T02:30:00Z'
    expect(toLogicalDateString(t, 3)).toBe('2025-12-31')
  })

  it('accepts Date objects and invalid inputs consistently with toLocalDateString', () => {
    expect(toLogicalDateString(new Date(Date.UTC(2026, 10, 7, 1, 30)), 3)).toBe('2026-11-06')
    expect(toLogicalDateString('bad', 3)).toBe('')
    expect(toLogicalDateString(null, 3)).toBe('')
    expect(toLogicalDateString(undefined, null)).toBe('')
  })
})
