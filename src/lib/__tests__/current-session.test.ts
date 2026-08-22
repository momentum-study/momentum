import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  loadGroup,
  saveGroup,
  isGroupFresh,
  finalizedSeconds,
  bumpLastSegment,
  pushSegment,
  GROUP_GAP_MS,
  type CurrentSessionGroup,
} from '../current-session'

const KEY = 'momentum-current-session-group'

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  // Pin to a deterministic time so gap-detection tests are reproducible.
  vi.setSystemTime(new Date('2025-06-24T10:00:00.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// loadGroup / saveGroup — round-trip persistence
// ---------------------------------------------------------------------------

describe('loadGroup / saveGroup', () => {
  it('returns null when nothing has been stored', () => {
    expect(loadGroup()).toBeNull()
  })

  it('round-trips a group through localStorage', () => {
    const group: CurrentSessionGroup = {
      startedAt: 1_700_000_000_000,
      segments: [{ subjectId: 'math', seconds: 600 }, { subjectId: 'eng', seconds: 300 }],
      lastEndAt: 1_700_000_900_000,
      active: false,
    }
    saveGroup(group)
    expect(loadGroup()).toEqual(group)
  })

  it('clears the stored group when passed null', () => {
    saveGroup({
      startedAt: 1,
      segments: [{ subjectId: 'math', seconds: 0 }],
      lastEndAt: 1,
      active: false,
    })
    saveGroup(null)
    expect(localStorage.getItem(KEY)).toBeNull()
    expect(loadGroup()).toBeNull()
  })

  it('returns null for malformed JSON', () => {
    localStorage.setItem(KEY, '{ this is not json')
    expect(loadGroup()).toBeNull()
  })

  it('returns null when required fields are missing', () => {
    localStorage.setItem(KEY, JSON.stringify({ foo: 'bar' }))
    expect(loadGroup()).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// isGroupFresh — gap detection (5 min rule)
// ---------------------------------------------------------------------------

describe('isGroupFresh', () => {
  const baseGroup: CurrentSessionGroup = {
    startedAt: 0,
    segments: [{ subjectId: 'math', seconds: 0 }],
    lastEndAt: 1_000_000,
    active: false,
  }

  it('returns false for null', () => {
    expect(isGroupFresh(null)).toBe(false)
  })

  it('returns true when the gap is exactly 0', () => {
    expect(isGroupFresh(baseGroup, 1_000_000)).toBe(true)
  })

  it('returns true when the gap is just under 5 minutes', () => {
    expect(isGroupFresh(baseGroup, 1_000_000 + GROUP_GAP_MS - 1)).toBe(true)
  })

  it('returns false when the gap exceeds 5 minutes', () => {
    expect(isGroupFresh(baseGroup, 1_000_000 + GROUP_GAP_MS + 1)).toBe(false)
  })

  it('uses Date.now() by default', () => {
    const nowMs = 5_000_000
    vi.setSystemTime(new Date(nowMs))
    // lastEndAt pinned 6 minutes before "now" → not fresh
    const group: CurrentSessionGroup = { ...baseGroup, lastEndAt: nowMs - GROUP_GAP_MS - 1 }
    expect(isGroupFresh(group)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// bumpLastSegment — accumulate seconds into the trailing segment
// ---------------------------------------------------------------------------

describe('bumpLastSegment', () => {
  it('returns the same group if there are no segments', () => {
    const empty: CurrentSessionGroup = {
      startedAt: 0,
      segments: [],
      lastEndAt: 0,
      active: false,
    }
    expect(bumpLastSegment(empty, 30)).toBe(empty)
  })

  it('adds positive seconds to the last segment', () => {
    const g: CurrentSessionGroup = {
      startedAt: 0,
      segments: [{ subjectId: 'math', seconds: 100 }, { subjectId: 'eng', seconds: 50 }],
      lastEndAt: 0,
      active: false,
    }
    const next = bumpLastSegment(g, 25)
    expect(next.segments[1].seconds).toBe(75)
  })

  it('clamps the result at zero for negative deltas', () => {
    const g: CurrentSessionGroup = {
      startedAt: 0,
      segments: [{ subjectId: 'math', seconds: 10 }],
      lastEndAt: 0,
      active: false,
    }
    expect(bumpLastSegment(g, -100).segments[0].seconds).toBe(0)
  })

  it('does not mutate the input group', () => {
    const g: CurrentSessionGroup = {
      startedAt: 0,
      segments: [{ subjectId: 'math', seconds: 0 }],
      lastEndAt: 0,
      active: false,
    }
    bumpLastSegment(g, 50)
    expect(g.segments[0].seconds).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// pushSegment — track subject changes
// ---------------------------------------------------------------------------

describe('pushSegment', () => {
  it('appends a new segment when the subject changes', () => {
    const g: CurrentSessionGroup = {
      startedAt: 0,
      segments: [{ subjectId: 'math', seconds: 600 }],
      lastEndAt: 0,
      active: false,
    }
    const next = pushSegment(g, 'eng')
    expect(next.segments).toHaveLength(2)
    expect(next.segments[1]).toEqual({ subjectId: 'eng', seconds: 0 })
  })

  it('is a no-op when pushing the same subject back-to-back', () => {
    const g: CurrentSessionGroup = {
      startedAt: 0,
      segments: [{ subjectId: 'math', seconds: 100 }],
      lastEndAt: 0,
      active: false,
    }
    expect(pushSegment(g, 'math')).toBe(g)
  })
})

// ---------------------------------------------------------------------------
// finalizedSeconds
// ---------------------------------------------------------------------------

describe('finalizedSeconds', () => {
  it('sums seconds across all segments', () => {
    const g: CurrentSessionGroup = {
      startedAt: 0,
      segments: [
        { subjectId: 'math', seconds: 600 },
        { subjectId: 'eng', seconds: 300 },
        { subjectId: 'sci', seconds: 120 },
      ],
      lastEndAt: 0,
      active: false,
    }
    expect(finalizedSeconds(g)).toBe(1020)
  })

  it('returns 0 for an empty group', () => {
    expect(finalizedSeconds(null)).toBe(0)
    expect(
      finalizedSeconds({ startedAt: 0, segments: [], lastEndAt: 0, active: false })
    ).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// End-to-end fold scenario — the user-facing behavior
// ---------------------------------------------------------------------------

describe('grouping scenario', () => {
  it('folds a follow-up run into the same group when it starts within 5 min', () => {
    const start = Date.now()
    // First run: study math for 25 min, then stop.
    let group: CurrentSessionGroup = {
      startedAt: start,
      segments: [{ subjectId: 'math', seconds: 0 }],
      lastEndAt: start,
      active: true,
    }
    // user stops after 25 min
    vi.setSystemTime(new Date(start + 25 * 60 * 1000))
    group = { ...bumpLastSegment(group, 25 * 60), lastEndAt: Date.now(), active: false }
    saveGroup(group)

    // 4 min later, user starts a new simple run
    const resumedAt = start + 29 * 60 * 1000
    vi.setSystemTime(new Date(resumedAt))
    const fresh = loadGroup()!
    // Re-evaluate freshness relative to the new "now"
    expect(isGroupFresh(fresh, resumedAt)).toBe(true)

    // Same subject → continue without pushing
    const continued = pushSegment(fresh, 'math')
    expect(continued.segments).toHaveLength(1)
    expect(finalizedSeconds(continued)).toBe(25 * 60)
  })

  it('breaks into a fresh group when the gap exceeds 5 min', () => {
    const start = Date.now()
    saveGroup({
      startedAt: start,
      segments: [{ subjectId: 'math', seconds: 60 }],
      lastEndAt: start + 60 * 1000,
      active: false,
    })
    const resumedAt = start + 7 * 60 * 1000
    vi.setSystemTime(new Date(resumedAt))
    expect(isGroupFresh(loadGroup(), resumedAt)).toBe(false)
  })

  it('subject switches produce separate segments while keeping the same group', () => {
    const start = Date.now()
    let group: CurrentSessionGroup = {
      startedAt: start,
      segments: [{ subjectId: 'math', seconds: 0 }],
      lastEndAt: start,
      active: true,
    }
    // 20 min into math, user switches to english
    vi.setSystemTime(new Date(start + 20 * 60 * 1000))
    group = bumpLastSegment(group, 20 * 60)
    group = pushSegment(group, 'eng')
    // 10 min into english, user stops
    vi.setSystemTime(new Date(start + 30 * 60 * 1000))
    group = { ...bumpLastSegment(group, 10 * 60), active: false, lastEndAt: Date.now() }

    expect(group.segments.map((s) => s.subjectId)).toEqual(['math', 'eng'])
    expect(group.segments.map((s) => s.seconds)).toEqual([20 * 60, 10 * 60])
    expect(finalizedSeconds(group)).toBe(30 * 60)
  })
})
