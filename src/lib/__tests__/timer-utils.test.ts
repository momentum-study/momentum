import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  formatTotalToday,
  isTimerActive,
  getLiveTimerSeconds,
} from '../timer-utils'

const STORAGE_KEY = 'momentum-timer-state'
const QUICK_KEY = 'momentum-quick-timer'

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2025-06-24T10:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// formatTotalToday — pure function, no localStorage
// ---------------------------------------------------------------------------

describe('formatTotalToday', () => {
  describe('without seconds (default)', () => {
    it('formats 0 minutes', () => {
      expect(formatTotalToday(0)).toBe('0m')
    })

    it('formats minutes under an hour', () => {
      expect(formatTotalToday(45)).toBe('45m')
    })

    it('formats exactly one hour', () => {
      expect(formatTotalToday(60)).toBe('1h')
    })

    it('formats hours and minutes', () => {
      expect(formatTotalToday(75)).toBe('1h 15m')
    })

    it('formats large values', () => {
      expect(formatTotalToday(600)).toBe('10h')
    })

    it('rounds fractional minutes', () => {
      expect(formatTotalToday(1.4)).toBe('1m')
      expect(formatTotalToday(1.6)).toBe('2m')
    })
  })

  describe('with seconds', () => {
    it('formats 0 as 0s', () => {
      expect(formatTotalToday(0, true)).toBe('0s')
    })

    it('formats seconds only', () => {
      // 0.5 minutes = 30 seconds
      expect(formatTotalToday(0.5, true)).toBe('30s')
    })

    it('formats minutes and seconds', () => {
      // 1.5 minutes = 90 seconds = 1m 30s
      expect(formatTotalToday(1.5, true)).toBe('1m 30s')
    })

    it('formats hours, minutes, and seconds', () => {
      // 61.5 minutes = 3690 seconds = 1h 1m 30s
      expect(formatTotalToday(61.5, true)).toBe('1h 1m 30s')
    })

    it('formats exactly one hour with seconds', () => {
      // 60 minutes = 3600 seconds = 1h 0m 0s
      expect(formatTotalToday(60, true)).toBe('1h 0m 0s')
    })
  })
})

// ---------------------------------------------------------------------------
// isTimerActive — reads localStorage
// ---------------------------------------------------------------------------

describe('isTimerActive', () => {
  it('returns false when no timer state exists', () => {
    expect(isTimerActive()).toBe(false)
  })

  it('returns true for a running simple timer (startedAt set)', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      mode: 'simple',
      startedAt: Date.now(),
      phaseRemaining: null,
      phase: 'focus',
      cyclesCompleted: 0,
      config: { focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, cycles: 4 },
      simplePausedOffset: 0,
    }))
    expect(isTimerActive()).toBe(true)
  })

  it('returns true for a paused simple timer with offset > 0', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      mode: 'simple',
      startedAt: null,          // paused
      phaseRemaining: null,
      phase: 'focus',
      cyclesCompleted: 0,
      config: { focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, cycles: 4 },
      simplePausedOffset: 120,  // 2 minutes accumulated
    }))
    expect(isTimerActive()).toBe(true)
  })

  it('returns false for a paused simple timer with offset 0', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      mode: 'simple',
      startedAt: null,
      phaseRemaining: null,
      phase: 'focus',
      cyclesCompleted: 0,
      config: { focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, cycles: 4 },
      simplePausedOffset: 0,
    }))
    expect(isTimerActive()).toBe(false)
  })

  it('returns true for a running pomodoro timer', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      mode: 'pomodoro',
      startedAt: Date.now(),
      phaseRemaining: 1500,
      phase: 'focus',
      cyclesCompleted: 0,
      config: { focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, cycles: 4 },
      simplePausedOffset: 0,
    }))
    expect(isTimerActive()).toBe(true)
  })

  it('returns false for a stopped pomodoro timer', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      mode: 'pomodoro',
      startedAt: null,
      phaseRemaining: 1500,
      phase: 'focus',
      cyclesCompleted: 0,
      config: { focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, cycles: 4 },
      simplePausedOffset: 0,
    }))
    expect(isTimerActive()).toBe(false)
  })

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem(STORAGE_KEY, 'not-json')
    expect(isTimerActive()).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// getLiveTimerSeconds — reads localStorage + uses Date.now()
// ---------------------------------------------------------------------------

describe('getLiveTimerSeconds', () => {
  it('returns 0 when no timer state exists', () => {
    expect(getLiveTimerSeconds()).toBe(0)
  })

  it('computes elapsed seconds for a running simple timer', () => {
    const started = Date.now() - 60_000 // started 60 seconds ago
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      mode: 'simple',
      startedAt: started,
      phaseRemaining: null,
      phase: 'focus',
      cyclesCompleted: 0,
      config: { focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, cycles: 4 },
      simplePausedOffset: 0,
    }))
    expect(getLiveTimerSeconds()).toBe(60)
  })

  it('adds paused offset when simple timer is paused', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      mode: 'simple',
      startedAt: null,
      phaseRemaining: null,
      phase: 'focus',
      cyclesCompleted: 0,
      config: { focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, cycles: 4 },
      simplePausedOffset: 300,
    }))
    expect(getLiveTimerSeconds()).toBe(300)
  })

  it('adds offset plus live elapsed for running simple timer', () => {
    const started = Date.now() - 120_000 // 2 minutes ago
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      mode: 'simple',
      startedAt: started,
      phaseRemaining: null,
      phase: 'focus',
      cyclesCompleted: 0,
      config: { focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, cycles: 4 },
      simplePausedOffset: 60, // 1 minute previously accumulated
    }))
    // 60 (offset) + 120 (elapsed) = 180
    expect(getLiveTimerSeconds()).toBe(180)
  })

  it('computes elapsed seconds for a running pomodoro timer', () => {
    const started = Date.now() - 90_000 // 90 seconds ago
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      mode: 'pomodoro',
      startedAt: started,
      phaseRemaining: 1500,
      phase: 'focus',
      cyclesCompleted: 0,
      config: { focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, cycles: 4 },
      simplePausedOffset: 0,
    }))
    expect(getLiveTimerSeconds()).toBe(90)
  })

  it('returns 0 for a stopped pomodoro (startedAt null)', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      mode: 'pomodoro',
      startedAt: null,
      phaseRemaining: 1500,
      phase: 'focus',
      cyclesCompleted: 0,
      config: { focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, cycles: 4 },
      simplePausedOffset: 0,
    }))
    expect(getLiveTimerSeconds()).toBe(0)
  })

  it('includes quick timer seconds when quick timer is running', () => {
    localStorage.setItem(QUICK_KEY, JSON.stringify({
      running: true,
      startedAt: Date.now() - 30_000, // 30 seconds ago
      seconds: 100, // previously accumulated
    }))
    // 100 (accumulated) + 30 (elapsed) = 130
    expect(getLiveTimerSeconds()).toBe(130)
  })

  it('includes quick timer accumulated seconds when stopped', () => {
    localStorage.setItem(QUICK_KEY, JSON.stringify({
      running: false,
      startedAt: null,
      seconds: 45,
    }))
    expect(getLiveTimerSeconds()).toBe(45)
  })

  it('combines main timer and quick timer', () => {
    const started = Date.now() - 60_000
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      mode: 'simple',
      startedAt: started,
      phaseRemaining: null,
      phase: 'focus',
      cyclesCompleted: 0,
      config: { focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, cycles: 4 },
      simplePausedOffset: 0,
    }))
    localStorage.setItem(QUICK_KEY, JSON.stringify({
      running: false,
      startedAt: null,
      seconds: 30,
    }))
    // 60 (main) + 30 (quick) = 90
    expect(getLiveTimerSeconds()).toBe(90)
  })

  it('handles corrupted main timer state gracefully', () => {
    localStorage.setItem(STORAGE_KEY, 'not-json')
    expect(getLiveTimerSeconds()).toBe(0)
  })

  it('handles corrupted quick timer state gracefully', () => {
    localStorage.setItem(QUICK_KEY, 'not-json')
    expect(getLiveTimerSeconds()).toBe(0)
  })
})
