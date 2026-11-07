import { loadSettings } from './settings-store'
import { normalizeDayStartHour } from './date-utils'

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
  routineId?: string | null
  focusTag?: 'focused' | 'distracted' | 'group' | 'revision'
  /** True when closing/sleep finalized the timer; false means crash snapshot. */
  final?: boolean
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

/** A tick gap larger than this while a timer is running means the machine
 *  slept (lid closed / screen off): timers are frozen during suspend, so on
 *  wake the wall clock has jumped. Background-tab throttling fires timers at
 *  most ~1/minute, so it can never reach this threshold. */
export const SLEEP_GAP_MS = 90_000

export type TimerMode = 'simple' | 'pomodoro'
export type TimerPhase = 'focus' | 'shortBreak' | 'longBreak'

export interface TimerConfig {
  focusMinutes: number
  breakMinutes: number
  longBreakMinutes: number
  cycles: number
  soundEnabled?: boolean
  customFirstFocusMinutes?: number | null
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
  /** One-time custom focus duration (minutes) for the first focus phase of the
   *  current session. Cleared after the first focus completes so subsequent
   *  cycles use the normal config. */
  customFirstFocusMinutes?: number | null
  /** Simple timer: total seconds accumulated before the most recent pause (0 if not paused). */
  simplePausedOffset: number
  subjectId?: string
  parentSubjectId?: string | null
  /** Notes about what the user is studying. */
  notes?: string
  /** Focus quality tag for the active session. */
  focusTag?: 'focused' | 'distracted' | 'group' | 'revision'
  /** Routine the active session is being logged toward (optional). */
  routineId?: string | null
}
export function saveTimerState(state: PersistedTimerState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    window.dispatchEvent(new CustomEvent('momentum:timer-state-changed'))
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
    window.dispatchEvent(new CustomEvent('momentum:timer-state-changed'))
  } catch {
    // ignore
  }
}

/** Per-subject last-used note. Used by the Study Timer to show a gray
 *  "last note" hint in the textarea so users can re-use their most recent
 *  note for that subject without re-typing it. Stored in localStorage and
 *  scoped per subject so different subjects don't bleed notes into each other. */
const LAST_NOTE_PREFIX = 'momentum-last-note-'

export function getLastNote(subjectId: string): string | null {
  if (!subjectId || typeof localStorage === 'undefined') return null
  try {
    return localStorage.getItem(LAST_NOTE_PREFIX + subjectId)
  } catch {
    return null
  }
}

export function setLastNote(subjectId: string, note: string): void {
  if (!subjectId || typeof localStorage === 'undefined') return
  const trimmed = note.trim()
  try {
    if (trimmed) {
      localStorage.setItem(LAST_NOTE_PREFIX + subjectId, trimmed)
    } else {
      localStorage.removeItem(LAST_NOTE_PREFIX + subjectId)
    }
  } catch {
    // ignore
  }
}

/** Get the next logical study-day boundary (§10.73) at or after `date`, in
 *  local time, as ms since epoch. With dayStartHour = 0 this is the next
 *  local midnight. With dayStartHour = H, timestamps in [00:00, H) already
 *  belong to the previous logical day, so for those the boundary is the
 *  upcoming H:00 (today), not tomorrow's midnight. */
function getDayBoundaryMs(date: Date, dayStartHour: number): number {
  const h = Math.max(0, Math.min(23, Math.floor(dayStartHour)))
  if (h === 0) {
    const d = new Date(date)
    d.setHours(24, 0, 0, 0)
    return d.getTime()
  }
  const d = new Date(date)
  if (d.getHours() < h) {
    // Pre-dawn: next boundary is today at H:00.
    d.setHours(h, 0, 0, 0)
    return d.getTime()
  }
  // Otherwise: tomorrow at H:00.
  const b = new Date(d)
  b.setHours(24, 0, 0, 0)
  b.setHours(h, 0, 0, 0)
  return b.getTime()
}

/**
 * Check if a session crosses the user's logical study-day boundary (§10.73).
 * If so, split it into two sessions: one ending at the boundary, one starting
 * at it. Returns an array of one or two session-like objects.
 *
 * Both sessions get the same subjectId, projectId, source, note,
 * assignmentId, routineId, and focusTag.
 */
export function splitSessionAtMidnight(
  session: {
    id: string
    subjectId: string
    projectId: string | null
    assignmentId: string | null
    startAt: string
    endAt: string
    durationMinutes: number
    durationSeconds?: number
    note: string | undefined
    focusTag?: 'focused' | 'distracted' | 'group' | 'revision'
    source: 'timer' | 'pomodoro' | 'quickLog'
    createdAt: string
    updatedAt: string
  }
): Array<{
  id: string
  subjectId: string
  projectId: string | null
  assignmentId: string | null
  startAt: string
  endAt: string
  durationMinutes: number
  durationSeconds: number
  note: string | undefined
  source: 'timer' | 'pomodoro' | 'quickLog'
  focusTag?: 'focused' | 'distracted' | 'group' | 'revision'
  createdAt: string
  updatedAt: string
}> {
  const end = new Date(session.endAt)
  const start = new Date(session.startAt)
  const dayStartHour = normalizeDayStartHour(loadSettings().dayStartHour)
  const startDay = formatLocalDate(start, dayStartHour)
  const endDay = formatLocalDate(end, dayStartHour)

  // Same logical study day — no split needed
  if (startDay === endDay) {
    return [{
      ...session,
      durationSeconds: session.durationSeconds ?? session.durationMinutes * 60,
    }]
  }

  const boundaryMs = getDayBoundaryMs(start, dayStartHour)
  const boundaryDate = new Date(boundaryMs)
  const totalMs = end.getTime() - start.getTime()
  const beforeBoundaryMs = boundaryMs - start.getTime()
  const afterBoundaryMs = totalMs - beforeBoundaryMs
  // Use the actual elapsed ms for `durationSeconds` so the stored duration
  // agrees with the `startAt`/`endAt` timestamps. `beforeMinutes`/`afterMinutes`
  // is floored to whole minutes for the session ID (which is hashed by minute)
  // but the actual elapsed seconds still travel with the row.
  const beforeSeconds = Math.max(1, Math.round(beforeBoundaryMs / 1000))
  const afterSeconds = Math.max(1, Math.round(afterBoundaryMs / 1000))
  const beforeMinutes = Math.max(1, Math.round(beforeBoundaryMs / 60000))
  const afterMinutes = Math.max(1, Math.round(afterBoundaryMs / 60000))

  const beforeId = sessionIdFor(session.startAt, session.subjectId, beforeMinutes)
  const afterId = sessionIdFor(boundaryDate.toISOString(), session.subjectId, afterMinutes)
  return [
    {
      id: beforeId,
      subjectId: session.subjectId,
      projectId: session.projectId,
      assignmentId: session.assignmentId,
      startAt: session.startAt,
      endAt: boundaryDate.toISOString(),
      durationMinutes: beforeMinutes,
      durationSeconds: beforeSeconds,
      note: session.note,
      focusTag: session.focusTag,
      source: session.source,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    },
    {
      id: afterId,
      subjectId: session.subjectId,
      projectId: session.projectId,
      assignmentId: session.assignmentId,
      startAt: boundaryDate.toISOString(),
      endAt: session.endAt,
      durationMinutes: afterMinutes,
      durationSeconds: afterSeconds,
      note: session.note,
      focusTag: session.focusTag,
      source: session.source,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    },
  ]
}

/** Format a Date as the user's logical study day (§10.73), given an
 *  already-normalized dayStartHour. Mirrors toLogicalDateString for Date
 *  inputs without re-reading settings per call. */
function formatLocalDate(d: Date, dayStartHour: number): string {
  if (dayStartHour === 0) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  if (d.getHours() < dayStartHour) {
    const shifted = new Date(d.getTime() - dayStartHour * 3_600_000)
    const y = shifted.getFullYear()
    const mm = String(shifted.getMonth() + 1).padStart(2, '0')
    const day = String(shifted.getDate()).padStart(2, '0')
    return `${y}-${mm}-${day}`
  }
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}