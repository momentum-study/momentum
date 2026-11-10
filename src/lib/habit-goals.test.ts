import { describe, it, expect } from 'vitest'
import { format, subDays } from 'date-fns'
import {
  habitStreak,
  habitIsCompleteToday,
  habitTarget,
  habitScheduledOn,
  rollingWeekCount,
  habitTargetLabel,
} from './habit-goals'
import type { Habit, HabitLog } from '../domain/types'

function isoDate(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

function makeHabit(overrides: Partial<Habit> = {}): Habit {
  const createdAt = overrides.createdAt ?? isoDate(new Date('2026-10-01')) + 'T00:00:00Z'
  return {
    id: 'h1',
    name: 'Test habit',
    kind: 'good',
    mode: 'count',
    color: '#6366f1',
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  }
}

function logOn(habitId: string, date: string): HabitLog {
  return { id: `${habitId}-${date}.${Math.random()}`, habitId, date, createdAt: date + 'T10:00:00Z', updatedAt: date + 'T10:00:00Z' }
}

function logsFromDates(dates: string[], habitId = 'h1'): HabitLog[] {
  return dates.map((d) => logOn(habitId, d))
}

// Anchored today: 2026-11-11 (weekday 3 = Wednesday) — deterministic, no Date.now() drift.
const TODAY = new Date('2026-11-11T12:00:00Z')
const TODAY_STR = isoDate(TODAY)

describe('habitTarget', () => {
  it('defaults to daily, 1/day for tick mode', () => {
    expect(habitTarget(makeHabit({ mode: 'tick' }))).toEqual({ period: 'day', perDay: 1 })
  })
  it('uses targetPerDay for count mode', () => {
    expect(habitTarget(makeHabit({ targetPerDay: 3 }))).toEqual({ period: 'day', perDay: 3 })
  })
  it('returns weekly when targetPeriod is week with a positive perWeek', () => {
    expect(habitTarget(makeHabit({ targetPeriod: 'week', targetPerWeek: 3 }))).toEqual({ period: 'week', perWeek: 3 })
  })
  it('falls back to daily when weekly fields are absent', () => {
    expect(habitTarget(makeHabit({ targetPeriod: 'week' }))).toEqual({ period: 'day', perDay: 1 })
  })
})

describe('habitIsCompleteToday — daily', () => {
  it('is complete when today count meets targetPerDay', () => {
    const habit = makeHabit({ targetPerDay: 2 })
    const todayLogs = [logOn('h1', TODAY_STR), logOn('h1', TODAY_STR)]
    expect(habitIsCompleteToday(habit, todayLogs, TODAY_STR, TODAY.getDay())).toBe(true)
  })
  it('is incomplete when count below target', () => {
    const habit = makeHabit({ targetPerDay: 2 })
    expect(habitIsCompleteToday(habit, logsFromDates([TODAY_STR]), TODAY_STR, TODAY.getDay())).toBe(false)
  })
  it('tick mode completes with one log', () => {
    const habit = makeHabit({ mode: 'tick' })
    expect(habitIsCompleteToday(habit, logsFromDates([TODAY_STR]), TODAY_STR, TODAY.getDay())).toBe(true)
  })
  it('rest day is always complete (exempt)', () => {
    const rest = makeHabit({ scheduledDays: [1] }) // Mon only; today is Wed → rest day
    expect(habitIsCompleteToday(rest, [], TODAY_STR, TODAY.getDay())).toBe(true)
  })
})

describe('habitScheduledOn', () => {
  it('every day when absent', () => {
    expect(habitScheduledOn(makeHabit(), 0)).toBe(true)
    expect(habitScheduledOn(makeHabit(), 6)).toBe(true)
  })
  it('only scheduled days when set', () => {
    const habit = makeHabit({ scheduledDays: [1, 3] })
    expect(habitScheduledOn(habit, 1)).toBe(true)
    expect(habitScheduledOn(habit, 3)).toBe(true)
    expect(habitScheduledOn(habit, 2)).toBe(false)
  })
})

describe('rollingWeekCount', () => {
  it('counts unique logged days in the rolling 7-day window including today', () => {
    const d1 = isoDate(subDays(TODAY, 6))
    const d2 = isoDate(subDays(TODAY, 2))
    const d3 = isoDate(subDays(TODAY, 8)) // outside the window
    const n = rollingWeekCount('h1', [...logsFromDates([d1, d2]), logOn('h1', d2), logOn('h1', d3)], TODAY_STR)
    expect(n).toBe(2)
  })
})

describe('habitIsCompleteToday — weekly', () => {
  it('completes when window has enough unique days', () => {
    const habit = makeHabit({ targetPeriod: 'week', targetPerWeek: 3 })
    const dates = [
      isoDate(subDays(TODAY, 6)),
      isoDate(subDays(TODAY, 5)),
      isoDate(subDays(TODAY, 1)),
    ]
    expect(habitIsCompleteToday(habit, logsFromDates(dates), TODAY_STR, TODAY.getDay())).toBe(true)
  })
  it('same-day duplicates count once (unique logged days)', () => {
    const habit = makeHabit({ targetPeriod: 'week', targetPerWeek: 3 })
    const dates = [
      isoDate(subDays(TODAY, 2)),
      isoDate(subDays(TODAY, 2)),
      isoDate(subDays(TODAY, 3)),
    ]
    expect(habitIsCompleteToday(habit, logsFromDates(dates), TODAY_STR, TODAY.getDay())).toBe(false)
    expect(rollingWeekCount('h1', logsFromDates(dates), TODAY_STR)).toBe(2)
  })
  it('over-completing keeps the habit complete on later days', () => {
    const habit = makeHabit({ targetPeriod: 'week', targetPerWeek: 3 })
    const dates = [0, 1, 2, 3].map((i) => isoDate(subDays(TODAY, i)))
    expect(habitIsCompleteToday(habit, logsFromDates(dates), TODAY_STR, TODAY.getDay())).toBe(true)
  })
})

describe('habitStreak — good daily', () => {
  it('counts consecutive days and does not break on unlogged today', () => {
    const mon = isoDate(subDays(TODAY, 2))
    const tue = isoDate(subDays(TODAY, 1))
    const habit = makeHabit({ createdAt: isoDate(subDays(TODAY, 30)) + 'T00:00:00Z' })
    const { streak } = habitStreak(habit, logsFromDates([mon, tue]), TODAY, TODAY_STR)
    expect(streak).toBe(2)
  })
  it('banked freeze covers one missed day (5-on, 1-off, 4-on, today ⇒ alive)', () => {
    const habit = makeHabit({ createdAt: isoDate(subDays(TODAY, 30)) + 'T00:00:00Z' })
    // 5 logged days (-9..-5) bank 1 freeze; miss -4 consumes it; -3..-1 logged;
    // today logged. Streak = 5 + 3 + 1 = 9.
    const run = [5, 6, 7, 8, 9].map((i) => isoDate(subDays(TODAY, i)))
    const frozenDay = isoDate(subDays(TODAY, 4))
    const rest = [1, 2, 3].map((i) => isoDate(subDays(TODAY, i)))
    const { streak, freezeDates } = habitStreak(
      habit,
      logsFromDates([...run, ...rest, TODAY_STR]),
      TODAY,
      TODAY_STR
    )
    expect(streak).toBe(9)
    expect(freezeDates.has(frozenDay)).toBe(true)
  })
  it('breaks when a second consecutive miss has no freeze (and resets the run)', () => {
    const habit = makeHabit({ createdAt: isoDate(subDays(TODAY, 30)) + 'T00:00:00Z' })
    // 5-run (-6..-10) banks a freeze; miss -5 consumes it; miss -4 breaks;
    // log -3, -2; miss -1 (run of 2 has no freeze) → reset to 0.
    const logged = [6, 7, 8, 9, 10, 2, 3].map((i) => isoDate(subDays(TODAY, i)))
    const { streak, freezeDates } = habitStreak(habit, logsFromDates(logged), TODAY, TODAY_STR)
    expect(streak).toBe(0)
    expect(freezeDates.size).toBe(0)
  })
  it('rest days never break the streak', () => {
    const habit = makeHabit({ createdAt: isoDate(subDays(TODAY, 30)) + 'T00:00:00Z', scheduledDays: [1, 3, 5] })
    // Tue (-1) is a scheduled... no: weekday of yesterday is 2 (Tue) — not scheduled → rest day.
    // Mon (-2? no) — use only yesterday's rest + today unlogged: streak 0 is also acceptable,
    // but with a Mon log the streak must be 1.
    const mon = isoDate(subDays(TODAY, 1))
    void mon
    const loggedTwoDaysAgo = isoDate(subDays(TODAY, 2))
    const { streak } = habitStreak(habit, logsFromDates([loggedTwoDaysAgo]), TODAY, TODAY_STR)
    // -2 (Mon, scheduled, logged) +1; -1 (Tue, rest) no-op; today unlogged no-op ⇒ 1
    expect(streak).toBe(1)
  })
})

describe('habitStreak — weekly', () => {
  it('counts consecutive past weeks meeting the target; current week exempt', () => {
    const habit = makeHabit({ targetPeriod: 'week', targetPerWeek: 2, createdAt: isoDate(subDays(TODAY, 40)) + 'T00:00:00Z' })
    // Window ending yesterday (days 1..7 back) has ≥2; window ending 8 days back
    // Windows are contiguous 7-day blocks ending yesterday, then rolling back
    // in 7-day steps: block1 = -1..-7, block2 = -8..-14.
    const dates = [
      isoDate(subDays(TODAY, 2)), isoDate(subDays(TODAY, 5)),   // block1: 2 unique days ✓
      isoDate(subDays(TODAY, 8)), isoDate(subDays(TODAY, 9)),   // block2: 2 unique days ✓
    ]
    const { streak } = habitStreak(habit, logsFromDates(dates), TODAY, TODAY_STR)
    expect(streak).toBe(2)
  })
  it('zero logs gives streak 0 (current week exemption does not manufacture credit)', () => {
    const habit = makeHabit({ targetPeriod: 'week', targetPerWeek: 2, createdAt: isoDate(subDays(TODAY, 40)) + 'T00:00:00Z' })
    const { streak } = habitStreak(habit, [], TODAY, TODAY_STR)
    expect(streak).toBe(0)
  })
})

describe('habitStreak — bad habits', () => {
  it('counts consecutive lapse-free days; a lapse resets to 0', () => {
    const habit = makeHabit({ kind: 'bad', createdAt: isoDate(subDays(TODAY, 10)) + 'T00:00:00Z' })
    // Lapse 5 days ago → 4 lapse-free days since (yesterday…4-back... walk
    // from yesterday: -1..-4 free = 4, hit lapse at -5, stop).
    const lapseFree = habitStreak(habit, logsFromDates([isoDate(subDays(TODAY, 5))]), TODAY, TODAY_STR)
    expect(lapseFree.streak).toBe(4)
  })
  it('no lapses ever → streak counts since creation', () => {
    const habit = makeHabit({ kind: 'bad', createdAt: isoDate(subDays(TODAY, 10)) + 'T00:00:00Z' })
    const { streak } = habitStreak(habit, [], TODAY, TODAY_STR)
    // days between creation day and yesterday: creation day itself doesn't count as "before creation"
    expect(streak).toBe(10)
  })
})

describe('habitTargetLabel', () => {
  it('labels daily tick, daily count and weekly targets', () => {
    expect(habitTargetLabel(makeHabit({ mode: 'tick' }))).toBe('Every day')
    expect(habitTargetLabel(makeHabit({ targetPerDay: 3 }))).toBe('3×/day')
    expect(habitTargetLabel(makeHabit({ targetPeriod: 'week', targetPerWeek: 2 }))).toBe('2×/week')
  })
})
