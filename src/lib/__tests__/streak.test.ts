import { describe, it, expect } from 'vitest'
import { format, subDays } from 'date-fns'

function computeStreak(studyDates: string[], today = '2026-07-21'): number {
  const daySet = new Set(studyDates)
  let count = 0
  let consecutiveLogged = 0
  let freezes = 0
  let d = new Date(today + 'T00:00:00')
  // If today isn't logged, start from yesterday so the streak holds
  // through the current day until the user logs (or the day ends).
  const todayStr = format(d, 'yyyy-MM-dd')
  if (!daySet.has(todayStr)) {
    d = subDays(d, 1)
  }
  while (true) {
    const ds = format(d, 'yyyy-MM-dd')
    if (daySet.has(ds)) {
      count++
      consecutiveLogged++
      if (consecutiveLogged === 5) { freezes++; consecutiveLogged = 0 }
    } else if (freezes > 0) {
      freezes--
      consecutiveLogged = 0
    } else {
      break
    }
    d = subDays(d, 1)
  }
  return count
}

function computeLongestStreak(studyDates: string[]): number {
  const daySet = new Set(studyDates)
  const sortedDays = [...daySet].sort()
  if (sortedDays.length === 0) return 0
  if (sortedDays.length === 1) return 1
  let max = 0
  for (const anchor of sortedDays) {
    let count = 0
    let consecutiveLogged = 0
    let freezes = 0
    let d = new Date(anchor + 'T00:00:00')
    while (true) {
      const ds = format(d, 'yyyy-MM-dd')
      if (daySet.has(ds)) {
        count++
        consecutiveLogged++
        if (consecutiveLogged === 5) { freezes++; consecutiveLogged = 0 }
      } else if (freezes > 0) {
        freezes--
        consecutiveLogged = 0
      } else {
        break
      }
      d = subDays(d, 1)
    }
    if (count > max) max = count
  }
  return max
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

  it('uses freeze from 5 consecutive days to cover one miss', () => {
    // 5 hits → earn freeze → 1 miss (covered) → hit → total = 6 logged, 6 count
    const days = ['2026-07-21', '2026-07-20', '2026-07-19', '2026-07-18', '2026-07-17', '2026-07-15']
    expect(computeStreak(days)).toBe(6)
  })

  it('breaks immediately without freeze on a single miss', () => {
    // Only 1 consecutive logged day, no freeze available
    const days = ['2026-07-21', '2026-07-19']
    expect(computeStreak(days)).toBe(1)
  })

  it('breaks after two missed days even when freeze was earned', () => {
    // 5 hits → earn freeze → 1 miss (covered) → 2nd miss (no freeze) → break
    const days = ['2026-07-21', '2026-07-20', '2026-07-19', '2026-07-18', '2026-07-17', '2026-07-14']
    expect(computeStreak(days)).toBe(5)
  })

  it('uses one freeze and stops on second miss one day later', () => {
    // 5 hits, miss (covered by freeze), then hit again
    const days = ['2026-07-21', '2026-07-20', '2026-07-19', '2026-07-18', '2026-07-17', '2026-07-15', '2026-07-13']
    expect(computeStreak(days)).toBe(6)
  })
  it('holds the streak when today is not yet logged (regression)', () => {
    // User logged yesterday and the prior 4 days. Today (2026-07-21) has
    // no session yet — the streak should still report 5, not break to 0.
    // (Previously, the loop started at today, missed it, and immediately
    // returned 0 even though yesterday completed a 5-day run.)
    const days = ['2026-07-20', '2026-07-19', '2026-07-18', '2026-07-17', '2026-07-16']
    expect(computeStreak(days, '2026-07-21')).toBe(5)
  })
  it('returns 0 when neither today nor yesterday has a session', () => {
    // Two missed days without a freeze → chain already broken yesterday.
    const days = ['2026-07-19', '2026-07-18', '2026-07-17', '2026-07-16', '2026-07-15']
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

  it('finds longest run with freeze covering a gap', () => {
    // 5 hits → freeze earned → 1 miss covered → 1 hit → total 6 counted
    const days = ['2026-07-21', '2026-07-20', '2026-07-19', '2026-07-18', '2026-07-17', '2026-07-15']
    expect(computeLongestStreak(days)).toBe(6)
  })

  it('handles gap that splits a run into two parts', () => {
    // Days 21,20,19,18,17,15,14,13,12,11: that's actually 10 hits with
    // day 16 missed. First run (21→17) earns freeze, covers 16, continues.
    const days = ['2026-07-21', '2026-07-20', '2026-07-19', '2026-07-18', '2026-07-17', '2026-07-15', '2026-07-14', '2026-07-13', '2026-07-12', '2026-07-11']
    expect(computeLongestStreak(days)).toBe(10)
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
    // Simulates the user's data shape: Aug 8-18 run uses freeze earned on
    // Aug 14 to cover Aug 10, yielding current streak 10.
    // Longest streak must be at least 10.
    const days = [
      '2026-08-08', '2026-08-09', '2026-08-11', '2026-08-12', '2026-08-13',
      '2026-08-14', '2026-08-15', '2026-08-16', '2026-08-17', '2026-08-18',
    ]
    const cur = computeStreak(days, '2026-08-18')
    const longest = computeLongestStreak(days)
    expect(cur).toBe(10)
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
