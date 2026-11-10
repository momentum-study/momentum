/**
 * Habit target logic — the SINGLE place each habit's target/completion/streak
 * math lives (spec §6.5). Every consumer (HabitsPage cards, selected-habit
 * modal, card heatmap, notification reminders) reads through this file.
 *
 * Types:
 * - Daily habits — targetPerDay occurrences per day (tick mode = 1/day).
 * - Weekly habits (targetPeriod 'week') — targetPerWeek unique logged days
 *   inside a ROLLING 7-day window ending today (spec §10.74 — deliberately
 *   NOT calendar-week-aligned; a Sunday catch-up must still count).
 * - Optional scheduledDays: unscheduled weekdays are "Rest days" — they are
 *   exempt from completion and never break a streak.
 */
import { format, subDays } from 'date-fns'
import type { Habit, HabitLog } from '../domain/types'

export type HabitTarget = { period: 'day'; perDay: number } | { period: 'week'; perWeek: number }

export function habitTarget(habit: Habit): HabitTarget {
  if (habit.targetPeriod === 'week' && typeof habit.targetPerWeek === 'number' && habit.targetPerWeek > 0) {
    return { period: 'week', perWeek: habit.targetPerWeek }
  }
  return { period: 'day', perDay: habit.mode === 'tick' ? 1 : Math.max(1, habit.targetPerDay ?? 1) }
}

/** Is the habit scheduled (tracked) on this weekday? Absent/empty = every day. */
export function habitScheduledOn(habit: Habit, weekday: number): boolean {
  const days = habit.scheduledDays
  if (!days || days.length === 0) return true
  return days.includes(weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6)
}

/** Logs for a single habit, non-deleted — accepts the effective (optimistic-merged) list. */
export function habitLogsFor(habitId: string, logs: HabitLog[]): HabitLog[] {
  return logs.filter((l) => l.habitId === habitId && !l.deletedAt)
}

/** Unique logged date strings (YYYY-MM-DD) for a habit. */
export function habitLoggedDates(habitId: string, logs: HabitLog[]): Set<string> {
  const dates = new Set<string>()
  for (const l of logs) if (l.habitId === habitId && !l.deletedAt) dates.add(l.date)
  return dates
}

/** Rolling-7-day unique logged days including `todayStr`. */
export function rollingWeekCount(habitId: string, logs: HabitLog[], todayStr: string): number {
  const window = new Set<string>()
  for (let i = 0; i < 7; i++) window.add(format(subDays(new Date(todayStr), i), 'yyyy-MM-dd'))
  let n = 0
  for (const ds of habitLoggedDates(habitId, logs)) if (window.has(ds)) n++
  return n
}

/** Today's occurrence count for daily habits. */
export function todayCount(habitId: string, logs: HabitLog[], todayStr: string): number {
  let n = 0
  for (const l of logs) if (l.habitId === habitId && !l.deletedAt && l.date === todayStr) n++
  return n
}

/**
 * Is the habit "complete for today"? For weekly habits that means the rolling
 * window already has targetPerWeek unique logged days. Rest days are always
 * "complete" (exempt) so no streak penalty accrues.
 */
export function habitIsCompleteToday(habit: Habit, logs: HabitLog[], todayStr: string, weekday: number): boolean {
  if (!habitScheduledOn(habit, weekday)) return true
  const t = habitTarget(habit)
  if (t.period === 'week') return rollingWeekCount(habit.id, logs, todayStr) >= t.perWeek
  return todayCount(habit.id, logs, todayStr) >= t.perDay
}

/**
 * Per-habit streak, forward-simulated chronologically like the study streak
 * (spec §10.64 — the direction of time is the invariant; a freeze can only
 * cover a gap that occurs AFTER the run that banked it).
 *
 * Semantics by shape:
 * - Good daily habits: consecutive completed days. Every 5 consecutive
 *   completed days banks 1 freeze; a missed (unscheduled-free) day consumes
 *   one; two consecutive misses break the chain. Today, if not yet logged,
 *   never breaks the chain (§10.45).
 * - Weekly habits: consecutive weeks meeting targetPerWeek in each week's own
 *   rolling window. The current week is exempt until it ends.
 * - Bad habits: consecutive days WITHOUT a lapse log; any lapse resets to 0
 *   (no freezes).
 *
 * Returns { streak, freezeDates } where freezeDates are the YYYY-MM-DD days
 * whose absence was frozen (for the heatmap ♡ markers).
 */
export function habitStreak(
  habit: Habit,
  logs: HabitLog[],
  today: Date,
  todayStr: string = format(today, 'yyyy-MM-dd')
): { streak: number; freezeDates: Set<string> } {
  const freezeDates = new Set<string>()
  const isBad = habit.kind === 'bad'
  const loggedDates = habitLoggedDates(habit.id, logs)
  const start = habit.createdAt
    ? format(new Date(habit.createdAt), 'yyyy-MM-dd')
    : null

  // Bad habits: walk backwards from yesterday — any lapse breaks immediately.
  if (isBad) {
    let n = 0
    let d = subDays(today, 1)
    const createdDate = start
    while (true) {
      if (createdDate && d < new Date(createdDate)) break
      const ds = format(d, 'yyyy-MM-dd')
      if (loggedDates.has(ds)) break
      n++
      d = subDays(d, 1)
      if (createdDate && n > 365) break
    }
    return { streak: n, freezeDates }
  }

  const target = habitTarget(habit)

  // Weekly habits — consecutive fully-ended weeks meeting the target.
  if (target.period === 'week') {
    // Count unique logged days in the 7-day window ENDING at `endingOn`.
    const inWindow = (endingOn: string): number => {
      const w = new Set<string>()
      for (let i = 0; i < 7; i++) w.add(format(subDays(new Date(endingOn), i), 'yyyy-MM-dd'))
      let n = 0
      for (const ds of loggedDates) if (w.has(ds)) n++
      return n
    }
    // The current (in-progress) week window ends today; it is exempt until it
    // rolls into yesterday — so evaluate weeks ending yesterday and earlier.
    let weekEnd = subDays(today, 1)
    let n = 0
    // Safety bound: at most ~2 years of weeks.
    for (let i = 0; i < 104; i++) {
      if (start && format(weekEnd, 'yyyy-MM-dd') < start) break
      if (inWindow(format(weekEnd, 'yyyy-MM-dd')) >= target.perWeek) n++
      else break
      weekEnd = subDays(weekEnd, 7)
    }
    return { streak: n, freezeDates }
  }

  // Good daily habits — forward simulation.
  // Walk from creation date (or up to 365 days back) forward to today.
  // Today is NOT evaluated as a potential break (§10.45): an unlogged today
  // must leave the streak the user has earned intact.
  const firstDay = start
    ? new Date(start)
    : subDays(today, Math.min(365, 364))
  let streak = 0
  let consecutive = 0
  let freezes = 0
  const todayDay = new Date(todayStr)
  for (let d = new Date(firstDay); d <= todayDay; d.setDate(d.getDate() + 1)) {
    const ds = format(d, 'yyyy-MM-dd')
    const isToday = ds === todayStr
    const done = loggedDates.has(ds)
    if (habitScheduledOn(habit, d.getDay()) && !done && !isToday) {
      // A genuinely missed (scheduled, not-today) day.
      if (freezes > 0) {
        freezes--
        freezeDates.add(ds)
        consecutive = 0
      } else {
        streak = 0
        consecutive = 0
        freezeDates.clear() // frozen days before the break no longer matter for the current streak
      }
      continue
    }
    if (done) {
      streak++
      consecutive++
      if (consecutive % 5 === 0) freezes++
    }
    // Unlogged rest days and an unlogged today fall through: no break, no bank.
  }
  return { streak, freezeDates }
}

/** Human label for the target ("3×/day", "2×/week", "Every day"). */
export function habitTargetLabel(habit: Habit): string {
  const t = habitTarget(habit)
  if (t.period === 'week') return `${t.perWeek}×/week`
  if (habit.mode === 'tick') return 'Every day'
  return `${t.perDay}×/day`
}
