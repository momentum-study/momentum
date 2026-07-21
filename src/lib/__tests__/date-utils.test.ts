import { describe, it, expect, vi } from 'vitest'
import { toLocalDateString, sessionLocalDate } from '../date-utils'

describe('toLocalDateString', () => {
  // Pin timezone to UTC so ISO string → Date → format produces deterministic results.
  vi.stubEnv('TZ', 'UTC')

  it('formats ISO string to yyyy-MM-dd', () => {
    const result = toLocalDateString('2026-07-21T14:30:00Z')
    expect(result).toBe('2026-07-21')
  })

  it('handles Date object', () => {
    const result = toLocalDateString(new Date(2026, 6, 21))
    expect(result).toBe('2026-07-21')
  })

  it('returns empty string for null/undefined', () => {
    expect(toLocalDateString(null)).toBe('')
    expect(toLocalDateString(undefined)).toBe('')
  })

  it('returns empty string for invalid string input', () => {
    expect(toLocalDateString('not-a-date')).toBe('')
  })

  it('returns empty string for invalid Date object', () => {
    expect(toLocalDateString(new Date('invalid'))).toBe('')
  })
})

describe('sessionLocalDate', () => {
  vi.stubEnv('TZ', 'UTC')

  it('delegates to toLocalDateString', () => {
    expect(sessionLocalDate('2026-07-21T14:30:00Z')).toBe('2026-07-21')
  })
})
