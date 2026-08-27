import { endOfDay, endOfWeek, startOfWeek, subDays } from 'date-fns'
import { getWeekStartsOn } from './utils'

export type DatePreset = 'thisWeek' | 'lastWeek' | 'last2Weeks' | 'last7Days'

/**
 * Resolve the calendar range for a date-range preset button.
 *
 * `end` is always `endOfDay` so that sessions saved today (after midnight)
 * remain inside the range — that's the regression that previously made the
 * AI Review page show 0 minutes for the current day.
 */
export function getDatePresetRange(
  preset: DatePreset,
  now: Date = new Date(),
): { start: Date; end: Date } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  switch (preset) {
    case 'thisWeek': {
      const weekStartsOn = getWeekStartsOn()
      const start = startOfWeek(today, { weekStartsOn }) // user preference
      const end = endOfDay(endOfWeek(today, { weekStartsOn }))
      return { start, end }
    }
    case 'lastWeek': {
      const thisWeekStart = startOfWeek(today, { weekStartsOn: getWeekStartsOn() })
      const start = subDays(thisWeekStart, 7)
      const end = endOfDay(subDays(thisWeekStart, 1))
      return { start, end }
    }
    case 'last2Weeks': {
      const thisWeekStart = startOfWeek(today, { weekStartsOn: getWeekStartsOn() })
      const start = subDays(thisWeekStart, 14)
      const end = endOfDay(subDays(thisWeekStart, 1))
      return { start, end }
    }
    case 'last7Days': {
      // Sliding 7-day window ending today — guarantees a full week of data
      // regardless of which weekday the user opens the page on.
      const start = subDays(today, 6)
      const end = endOfDay(today)
      return { start, end }
    }
  }
}
