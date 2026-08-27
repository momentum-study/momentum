import { describe, it, expect, vi } from 'vitest'
import { getDatePresetRange } from '../date-presets'
import { isWithinInterval } from 'date-fns'

describe('getDatePresetRange', () => {
  vi.stubEnv('TZ', 'Australia/Sydney')

  // Pin to Wednesday 2026-08-26 14:30:00 AEST (UTC+10)
  const pinnedNow = new Date('2026-08-26T14:30:00+10:00')

  describe('last7Days', () => {
    it('includes today at end of day', () => {
      const { start, end } = getDatePresetRange('last7Days', pinnedNow)
      // start = 6 days before today (Aug 20)
      expect(start.getFullYear()).toBe(2026)
      expect(start.getMonth()).toBe(7) // August
      expect(start.getDate()).toBe(20)

      // end = end of today (Aug 26, 23:59:59.999)
      expect(end.getDate()).toBe(26)
      expect(end.getHours()).toBe(23)
      expect(end.getMinutes()).toBe(59)
    })

    it('today at 11:59pm is within range (regression: was showing 0)', () => {
      const { start, end } = getDatePresetRange('last7Days', pinnedNow)
      // Session at 11:59pm today should be inside the range
      const lateTonight = new Date('2026-08-26T23:59:00+10:00')
      expect(isWithinInterval(lateTonight, { start, end })).toBe(true)
    })

    it('today at 12:01am is within range', () => {
      const { start, end } = getDatePresetRange('last7Days', pinnedNow)
      const earlyToday = new Date('2026-08-26T00:01:00+10:00')
      expect(isWithinInterval(earlyToday, { start, end })).toBe(true)
    })

    it('7 days ago is outside range', () => {
      const { start } = getDatePresetRange('last7Days', pinnedNow)
      const tooEarly = new Date('2026-08-19T12:00:00+10:00')
      expect(isWithinInterval(tooEarly, { start, end: start })).toBe(false)
    })
  })

  describe('thisWeek', () => {
    it('start is beginning of week, end is end of week', () => {
      const { start, end } = getDatePresetRange('thisWeek', pinnedNow)
      // Aug 26 2026 is Wednesday; default getWeekStartsOn is Monday (1)
      // Range should be Mon Aug 24 - Sun Aug 30
      expect(start.getDay()).toBe(1) // Monday
      expect(start.getDate()).toBe(24)
      expect(start.getMonth()).toBe(7)
      expect(end.getDate()).toBe(30)
      expect(end.getMonth()).toBe(7)
      expect(end.getHours()).toBe(23)
      expect(end.getMinutes()).toBe(59)
    })
  })

  describe('lastWeek', () => {
    it('end is in the past, start is 7 days before end', () => {
      const { start, end } = getDatePresetRange('lastWeek', pinnedNow)
      const diffMs = end.getTime() - start.getTime()
      const diffDays = diffMs / (1000 * 60 * 60 * 24)
      // lastWeek should span ~7 days (endOfDay adds a fractional day)
      expect(diffDays).toBeCloseTo(7, 5)
      // end should be before today
      expect(end.getTime()).toBeLessThan(pinnedNow.getTime())
    })
  })

  describe('last2Weeks', () => {
    it('end is in the past, start is 14 days before end', () => {
      const { start, end } = getDatePresetRange('last2Weeks', pinnedNow)
      const diffMs = end.getTime() - start.getTime()
      const diffDays = diffMs / (1000 * 60 * 60 * 24)
      // last2Weeks should span ~14 days (endOfDay adds a fractional day)
      expect(diffDays).toBeCloseTo(14, 5)
    })
  })
})
