import { format } from 'date-fns'
import { loadSettings } from './settings-store'

/**
 * Normalize a date (string, Date, or null/undefined) to the user's local
 * "study day" string YYYY-MM-DD (§10.73) — identical semantics to the
 * toLocalDateString in utils.ts (kept for the modules that import this
 * variant). Returns '' for invalid inputs.
 */
export function toLocalDateString(date: Date | string | null | undefined): string {
  return toLogicalDateString(date, loadSettings().dayStartHour)
}

/** Normalize a session startAt to a local date string. */
export function sessionLocalDate(startAt: string): string {
  return toLocalDateString(startAt)
}
/** Clamp a stored dayStartHour to a valid 0-23 value. The setting is user
 *  editable and can arrive malformed from legacy localStorage payloads. */
export function normalizeDayStartHour(hour: number | null | undefined): number {
  const h = typeof hour === 'number' && Number.isFinite(hour) ? Math.floor(hour) : 0
  if (h < 0) return 0
  if (h > 23) return 23
  return h
}

/**
 * Logical study day for a timestamp, given the user's dayStartHour setting.
 *
 * A day that starts at 0 behaves exactly like a calendar day. A day that
 * starts at Hour H (e.g. 4) shifts the window: anything between 00:00 and
 * 04:00 is rolled back to the previous calendar day (late-night study
 * counts toward the day it began), anything from 04:00 belongs to that day.
 *
 * Returns the logical day as yyyy-MM-dd, or '' for invalid inputs.
 */
export function toLogicalDateString(
  date: Date | string | null | undefined,
  dayStartHour: number | null | undefined,
): string {
  if (date === null || date === undefined || date === '') return ''
  try {
    const d = typeof date === 'string' ? new Date(date) : date
    if (isNaN(d.getTime())) return ''
    const hour = normalizeDayStartHour(dayStartHour)
    if (hour === 0) return format(d, 'yyyy-MM-dd')
    if (d.getHours() < hour) {
      // [00:00, dayStart) belongs to yesterday: subtract the elapsed
      // hours-since-midnight to land in the previous day, then format.
      const shifted = new Date(d.getTime() - hour * 3_600_000)
      return format(shifted, 'yyyy-MM-dd')
    }
    return format(d, 'yyyy-MM-dd')
  } catch {
    return ''
  }
}
