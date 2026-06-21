// Timer persistence — keeps the study timer running across navigation and page refreshes.
// We store a start timestamp in localStorage and compute elapsed time from the wall clock,
// so the timer is accurate regardless of when the component mounts/unmounts.
const STORAGE_KEY = 'momentum-timer-state'
/** Key for a session that was saved synchronously on page close but not yet
 * committed to Dexie. The PomodoroTimer component checks this on mount and
 * saves it to Dexie asynchronously. */
const PENDING_SESSION_KEY = 'momentum-pending-session'


/** Generate a deterministic session ID from its content fields.
 *  Two sessions with the same startAt, subjectId, and durationMinutes
 *  will produce the same ID, making db.sessions.put() idempotent. */
export function sessionIdFor(startAt: string, subjectId: string, durationMinutes: number): string {
  const key = `${startAt}|${subjectId}|${durationMinutes}`
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < key.length; i++) {
    const ch = key.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return `s-${(h2 >>> 0).toString(36)}${(h1 >>> 0).toString(36)}`
}
export interface PendingSession {
  id: string
  subjectId: string
  projectId: string | null
  assignmentId: string | null
  startAt: string
  endAt: string
  durationMinutes: number
  durationSeconds?: number
  note: string | undefined
  source: 'timer' | 'pomodoro'
}

export function savePendingSession(session: PendingSession): void {
  try {
    localStorage.setItem(PENDING_SESSION_KEY, JSON.stringify(session))
  } catch { /* ignore */ }
}

export function loadPendingSession(): PendingSession | null {
  try {
    const raw = localStorage.getItem(PENDING_SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw) as PendingSession
  } catch { return null }
}

export function clearPendingSession(): void {
  try { localStorage.removeItem(PENDING_SESSION_KEY) } catch { /* ignore */ }
}

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
  /** Simple timer: total seconds accumulated before the most recent pause (0 if not paused). */
  simplePausedOffset: number
  subjectId?: string
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
