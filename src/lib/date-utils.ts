import { format } from 'date-fns'

/**
 * Normalize a date (string, Date, or null/undefined) to a local date string YYYY-MM-DD.
 * Uses the browser's local timezone. Returns '' for invalid inputs.
 */
export function toLocalDateString(date: Date | string | null | undefined): string {
  if (!date) return ''
  try {
    const d = typeof date === 'string' ? new Date(date) : date
    if (isNaN(d.getTime())) return ''
    return format(d, 'yyyy-MM-dd')
  } catch {
    return ''
  }
}

/** Normalize a session startAt to a local date string. */
export function sessionLocalDate(startAt: string): string {
  return toLocalDateString(startAt)
}
