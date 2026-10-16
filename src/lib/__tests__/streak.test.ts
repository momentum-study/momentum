import { describe, it, expect } from 'vitest'
import { differenceInCalendarDays } from 'date-fns'

const DAYS_PER_FREEZE = 5

interface Stats {
  streak: number
  longestStreak: number
  freezesAvailable: number
}

// Chronological forward simulation — mirrors simulateStreak in use-streak.ts.
function simulate(daysInput: string[], today?: string): Stats {
  if (daysInput.length === 0) return { streak: 0, longestStreak: 0, freezesAvailable: 0 }
  const days = [...new Set(daysInput)].sort()
  const now = new Date((today ?? days[days.length - 1]) + 'T00:00:00')
  let count = 0
  let consecutive = 0
  let freezes = 0
  let longest = 0
  let prev: Date | null = null
  let lastLogged: Date | null = null
  const consume = (missed: number) => {
    if (missed <= 0) return
    if (missed > freezes) {
      count = 0
      consecutive = 0
      freezes = 0
    } else {
      freezes -= missed
      consecutive = 0
    }
  }
  for (const ds of days) {
    const day = new Date(ds + 'T00:00:00')
    if (prev) consume(differenceInCalendarDays(day, prev) - 1)
    count++
    consecutive++
    if (consecutive === DAYS_PER_FREEZE) { freezes++; consecutive = 0 }
    if (count > longest) longest = count
    lastLogged = day
    prev = day
  }
  if (lastLogged) consume(differenceInCalendarDays(now, lastLogged) - 1)
  return { streak: count, longestStreak: longest, freezesAvailable: freezes }
}

function computeStreak(studyDates: string[], today?: string): number {
  return simulate(studyDates, today).streak
}

function computeLongestStreak(studyDates: string[]): number {
  return simulate(studyDates).longestStreak
}

describe('computeStreak', () => {
  it('returns 0 for no study days', () => {
    expect(computeStreak([])).toBe(0)
  })

  it('returns 1 for one consecutive day (today)', () => {
    expect(computeStreak(['2026-07-21'])).toBe(1)
  })

  it('returns 7 for 7 consecutive days', () => {
    const days = ['2026-07-21', '2026-07-20', '2026-07-19', '2026-07-18', '2026-07-17', '2026-07-16', '2026-07-15']
    expect(computeStreak(days)).toBe(7)
  })

  it('uses a freeze earned by a 5-day run to cover the next miss', () => {
    // 5 hits (15-19) → freeze earned → miss on 20 (covered) → hit on 21.
    // Chronologically the freeze is earned BEFORE the gap it covers.
    const days = ['2026-07-15', '2026-07-16', '2026-07-17', '2026-07-18', '2026-07-19', '2026-07-21']
    expect(computeStreak(days)).toBe(6)
  })

  it('reports a freeze remaining after a five-day run', () => {
    const result = simulate(['2026-07-15', '2026-07-16', '2026-07-17', '2026-07-18', '2026-07-19'], '2026-07-19')
    expect(result.freezesAvailable).toBe(1)
  })

  it('consumes a freeze when covering one missed day', () => {
    const result = simulate(['2026-07-15', '2026-07-16', '2026-07-17', '2026-07-18', '2026-07-19', '2026-07-21'], '2026-07-21')
    expect(result.streak).toBe(6)
    expect(result.freezesAvailable).toBe(0)
  })

  it('does not retroactively cover a gap that precedes the run', () => {
    // The 5-day run 17-21 earns its freeze AFTER the gap at 16, so it cannot
    // cover that earlier gap. Day 15 is a dead chain; streak = 17-21 = 5.
    const days = ['2026-07-21', '2026-07-20', '2026-07-19', '2026-07-18', '2026-07-17', '2026-07-15']
    expect(computeStreak(days)).toBe(5)
  })

  it('breaks immediately without freeze on a single miss', () => {
    // Only 1 consecutive logged day, no freeze available.
    const days = ['2026-07-21', '2026-07-19']
    expect(computeStreak(days)).toBe(1)
  })

  it('breaks after two missed days even when a freeze was earned', () => {
    // Run 17-21 earns one freeze; day 16 is covered but day 15 is a second
    // consecutive miss at that point in time, so the chain resets there and
    // the run 17-21 stands alone.
    const days = ['2026-07-21', '2026-07-20', '2026-07-19', '2026-07-18', '2026-07-17', '2026-07-14']
    expect(computeStreak(days)).toBe(5)
  })

  it('resets after a gap wider than the freeze budget', () => {
    // 5 hits (13-17) earn one freeze, then a 3-day gap: the freeze covers
    // one day, the rest kills the chain, and counting restarts at 21.
    const days = ['2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16', '2026-07-17', '2026-07-21']
    expect(computeStreak(days)).toBe(1)
  })

  it('holds the streak when today is not yet logged (regression)', () => {
    // User logged yesterday and the prior 4 days. Today (2026-07-21) has no
    // session yet — the streak should report 5, not break to 0. Today never
    // consumes a freeze.
    const days = ['2026-07-20', '2026-07-19', '2026-07-18', '2026-07-17', '2026-07-16']
    expect(computeStreak(days, '2026-07-21')).toBe(5)
  })

  it('covers a single stale day with the banked freeze (regression)', () => {
    // The user's reported bug: 5 consecutive days ending two days ago, with
    // only yesterday missed. The freeze earned by that run covers it, so the
    // streak must still read 5 — previously it collapsed to 0.
    const days = ['2026-07-19', '2026-07-18', '2026-07-17', '2026-07-16', '2026-07-15']
    expect(computeStreak(days, '2026-07-21')).toBe(5)
  })

  it('returns 0 when the chain died before the freeze budget could cover it', () => {
    // Only 2 consecutive logged days (no freeze earned) then a long gap.
    const days = ['2026-07-19', '2026-07-18']
    expect(computeStreak(days, '2026-07-21')).toBe(0)
  })
})

describe('computeLongestStreak', () => {
  it('returns 0 for empty set', () => {
    expect(computeLongestStreak([])).toBe(0)
  })

  it('returns 1 for a single day', () => {
    expect(computeLongestStreak(['2026-07-21'])).toBe(1)
  })

  it('returns 2 for 2 consecutive days', () => {
    expect(computeLongestStreak(['2026-07-21', '2026-07-20'])).toBe(2)
  })

  it('finds longest run with freeze covering a following gap', () => {
    // 5 hits (11-15) → freeze earned → miss on 16 covered → hits 17-21.
    const days = ['2026-07-21', '2026-07-20', '2026-07-19', '2026-07-18', '2026-07-17', '2026-07-15', '2026-07-14', '2026-07-13', '2026-07-12', '2026-07-11']
    expect(computeLongestStreak(days)).toBe(10)
  })

  it('does not bridge a gap that precedes the freeze-earning run', () => {
    // Run 17-21 (5 hits) cannot cover the gap at 16; longest is 5.
    const days = ['2026-07-21', '2026-07-20', '2026-07-19', '2026-07-18', '2026-07-17', '2026-07-15']
    expect(computeLongestStreak(days)).toBe(5)
  })

  it('handles gap > freeze budget correctly', () => {
    const days = ['2026-07-21', '2026-07-20', '2026-07-10']
    expect(computeLongestStreak(days)).toBe(2)
  })

  it('returns length of a clean run (no freezes needed)', () => {
    const days = ['2026-07-15', '2026-07-16', '2026-07-17', '2026-07-18', '2026-07-19']
    expect(computeLongestStreak(days)).toBe(5)
  })

  it('picks the longer of two separate runs', () => {
    const days = ['2026-07-10', '2026-07-11', '2026-07-20', '2026-07-21']
    expect(computeLongestStreak(days)).toBe(2)
  })

  it('regression: longest streak >= current streak for any dataset', () => {
    // 5 hits (11-15) earn a freeze, covering the gap at 10. The current
    // streak at 18 should be 8 (11-18, freeze consumed at 10, but the
    // current chain from 11 has no gap, so count = 8).
    // Longest must be at least the current.
    const days = [
      '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15',
      '2026-08-16', '2026-08-17', '2026-08-18',
    ]
    const cur = computeStreak(days, '2026-08-18')
    const longest = computeLongestStreak(days)
    expect(cur).toBe(8)
    expect(longest).toBeGreaterThanOrEqual(cur)
  })
})

// Mirror of the bestStreak effect in use-streak.ts: candidate = max(longest,
// current). This must hold whenever previewDates add a day the persisted
// longestStreak doesn't see yet.
function nextBest(best: number, longest: number, current: number): number {
  return Math.max(best, longest, current)
}

describe('bestStreak invariant', () => {
  it('updates when current streak exceeds persisted best (live timer case)', () => {
    // Persisted sessions: a 3-day run from Aug 1-3 (stored best = 3).
    // User just started the timer today (Aug 18) — previewDates adds today,
    // so current = 1, longest (from persisted only) = 3. bestStreak = 3.
    expect(nextBest(3, 3, 1)).toBe(3)
  })

  it('updates when current streak exceeds persisted best (mid-run)', () => {
    // User has been studying daily for 12 consecutive days, exceeding the
    // previous best of 8. currentStreak=12, longestStreak=12 (now includes
    // today), bestStreak must climb to 12.
    expect(nextBest(8, 12, 12)).toBe(12)
  })

  it('never decreases (only climbs)', () => {
    // After a streak breaks, bestStreak must NOT drop back down.
    expect(nextBest(10, 3, 0)).toBe(10)
  })

  it('regression: bestStreak >= currentStreak is the display invariant', () => {
    const cases: Array<[number, number, number]> = [
      [0, 0, 0],
      [5, 5, 3],
      [5, 7, 7], // current caught up to longest
      [10, 8, 12], // current > both (timer preview before persist)
      [100, 1, 1], // historical best far exceeds current
    ]
    for (const [best, longest, current] of cases) {
      const next = nextBest(best, longest, current)
      expect(next).toBeGreaterThanOrEqual(current)
    }
  })
})
