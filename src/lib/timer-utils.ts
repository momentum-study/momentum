// Shared timer utilities — used by Dashboard and PomodoroTimer for live "today total".
// Reads timer state from localStorage so any component can compute the live running total
// without needing direct access to the timer's internal state.

const STORAGE_KEY = 'momentum-timer-state'

export type TimerMode = 'simple' | 'pomodoro'
export type TimerPhase = 'focus' | 'shortBreak' | 'longBreak'

interface PersistedTimerState {
  mode: TimerMode
  startedAt: number | null
  phaseRemaining: number | null
  phase: TimerPhase
  cyclesCompleted: number
  config: { focusMinutes: number; shortBreakMinutes: number; longBreakMinutes: number; cycles: number }
  simplePausedOffset: number
  subjectId?: string
}

/** Read the current timer state from localStorage. */
function loadTimerState(): PersistedTimerState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as PersistedTimerState
  } catch {
    return null
  }
}

/**
 * Compute the number of seconds the timer has been running (or paused) based on
 * the current wall clock. Returns 0 if no timer is running.
 */
export function getLiveTimerSeconds(): number {
  const state = loadTimerState()
  if (!state) return 0

  if (state.mode === 'simple') {
    if (state.startedAt !== null) {
      return state.simplePausedOffset + Math.floor((Date.now() - state.startedAt) / 1000)
    }
    return state.simplePausedOffset
  }

  if (state.mode === 'pomodoro' && state.startedAt !== null && state.phaseRemaining !== null) {
    const elapsed = Math.floor((Date.now() - state.startedAt) / 1000)
    return Math.max(0, elapsed)
  }

  return 0
}

/** Get the subjectId of the currently active timer session. */
export function getLiveTimerSubjectId(): string | null {
  const state = loadTimerState()
  return state?.subjectId ?? null
}

/** Check if a timer is currently running (not paused, not stopped). */
export function isTimerRunning(): boolean {
  const state = loadTimerState()
  if (!state) return false
  return state.startedAt !== null
}

/** Check if a timer is active (running OR paused with a non-zero offset). */
export function isTimerActive(): boolean {
  const state = loadTimerState()
  if (!state) return false
  if (state.mode === 'simple') {
    return state.startedAt !== null || state.simplePausedOffset > 0
  }
  return state.startedAt !== null
}

/**
 * Format a duration in minutes as a human-readable string.
 * @param includeSeconds When true, includes seconds (e.g. "1h 15m 22s").
 *                       When false, compact format (e.g. "1h 15m").
 */
export function formatTotalToday(minutes: number, includeSeconds = false): string {
  if (!includeSeconds) {
    const totalMin = Math.round(minutes)
    if (totalMin < 60) return `${totalMin}m`
    const h = Math.floor(totalMin / 60)
    const m = totalMin % 60
    return m === 0 ? `${h}h` : `${h}h ${m}m`
  }

  const totalSec = Math.round(minutes * 60)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}
