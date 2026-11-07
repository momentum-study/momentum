import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { splitSessionAtMidnight, sessionIdFor } from '../timer-persistence'
import { DEFAULT_SETTINGS } from '../settings-store'

// Pin to UTC so local-hour math is deterministic.
vi.stubEnv('TZ', 'UTC')

// Write a settings payload loadSettings() will read back.
function setDayStartHour(hour: number) {
  localStorage.setItem('momentum-settings', JSON.stringify({ ...DEFAULT_SETTINGS, dayStartHour: hour }))
}

beforeEach(() => localStorage.clear())
afterEach(() => localStorage.clear())

const base = {
  id: sessionIdFor('2026-11-07T22:00:00.000Z', 'subject-1', 180),
  subjectId: 'subject-1',
  projectId: null as string | null,
  assignmentId: null as string | null,
  startAt: '2026-11-07T22:00:00.000Z',
  endAt: '2026-11-08T01:00:00.000Z',
  durationMinutes: 180,
  durationSeconds: 10_800,
  note: undefined,
  source: 'timer' as const,
  createdAt: '2026-11-08T01:00:00.000Z',
  updatedAt: '2026-11-08T01:00:00.000Z',
}

describe('splitSessionAtMidnight with dayStartHour', () => {
  it('does not split when dayStartHour covers the session (past-midnight session stays whole)', () => {
    setDayStartHour(4)
    const result = splitSessionAtMidnight(base)
    expect(result).toHaveLength(1)
    expect(result[0].durationMinutes).toBe(180)
  })

  it('splits at true midnight when dayStartHour is 0', () => {
    setDayStartHour(0)
    const result = splitSessionAtMidnight(base)
    expect(result).toHaveLength(2)
    expect(result[0].endAt).toBe('2026-11-08T00:00:00.000Z')
    expect(result[1].startAt).toBe('2026-11-08T00:00:00.000Z')
    expect(result[0].durationMinutes).toBe(120)
    expect(result[1].durationMinutes).toBe(60)
  })

  it('splits preserving focusTag on both halves', () => {
    setDayStartHour(2)
    const crossing = { ...base, endAt: '2026-11-08T21:30:00.000Z', durationMinutes: 1410, focusTag: 'focused' as const }
    const result = splitSessionAtMidnight(crossing)
    expect(result).toHaveLength(2)
    // dayStartHour = 2 → boundary is 02:00 on the 8th, not midnight.
    expect(result[0].endAt).toBe('2026-11-08T02:00:00.000Z')
    expect(result[0].durationSeconds).toBe(4 * 3600)
    expect(result[1].startAt).toBe('2026-11-08T02:00:00.000Z')
    expect(result.every((s) => s.focusTag === 'focused')).toBe(true)
  })

  it('gives the two halves distinct deterministic ids', () => {
    setDayStartHour(3)
    const result = splitSessionAtMidnight({ ...base, endAt: '2026-11-08T21:30:00.000Z', durationMinutes: 1410 })
    expect(result[0].id).not.toBe(result[1].id)
    expect(result[1].id).toBe(sessionIdFor(result[1].startAt, 'subject-1', result[1].durationMinutes))
  })

  it('does not split same-day sessions regardless of setting', () => {
    setDayStartHour(4)
    const result = splitSessionAtMidnight({ ...base, endAt: '2026-11-07T23:00:00.000Z', durationMinutes: 60 })
    expect(result).toHaveLength(1)
  })
})
