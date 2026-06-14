// Timer persistence — keeps the study timer running across navigation and page refreshes.
// We store a start timestamp in localStorage and compute elapsed time from the wall clock,
// so the timer is accurate regardless of when the component mounts/unmounts.
const STORAGE_KEY = 'momentum-timer-state'

export type TimerMode = 'simple' | 'pomodoro'
export type TimerPhase = 'focus' | 'shortBreak' | 'longBreak'

export interface TimerConfig {
  focusMinutes: number
  breakMinutes: number
  longBreakMinutes: number
  cycles: number
}

export interface PersistedTimerState {
  mode: TimerMode
  /** Start timestamp (ms since epoch) of the CURRENT phase. Null if paused. */
  startedAt: number | null
  /** Remaining seconds when paused (null if running). */
  phaseRemaining: number | null
  /** Pomodoro-only fields */
  phase: TimerPhase
  cyclesCompleted: number
  config: TimerConfig
}

export function saveTimerState(state: PersistedTimerState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // localStorage may be unavailable
  }
}

export function loadTimerState(): PersistedTimerState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedTimerState
    if (!parsed.mode) return null
    return parsed
  } catch {
    return null
  }
}

export function clearTimerState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
