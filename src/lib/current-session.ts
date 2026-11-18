/**
 * Current-session group tracker.
 *
 * Consecutive timer runs within GROUP_GAP_MS of each other, and subject
 * changes mid-session, fold into the same session group so the user sees a
 * single total time.
 */

export interface CurrentSegment {
  subjectId: string
  /** Seconds finalized from completed runs. */
  seconds: number
}

export interface CurrentSessionGroup {
  /** ms epoch when the first run in this group started. */
  startedAt: number
  /** Individual subject segments. The active run always maps to the last one. */
  segments: CurrentSegment[]
  /** ms epoch when the last run in this group ended. */
  lastEndAt: number
  /** True while a timer run is in-progress. */
  active: boolean
}

const KEY = 'momentum-current-session-group'
export const GROUP_GAP_MS = 5 * 60 * 1000
const EDIT_START_TOLERANCE_MS = 5_000

export function loadGroup(): CurrentSessionGroup | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CurrentSessionGroup
    if (typeof parsed.startedAt !== 'number' || !Array.isArray(parsed.segments)) return null
    return parsed
  } catch {
    return null
  }
}

export function saveGroup(g: CurrentSessionGroup | null): void {
  if (typeof localStorage === 'undefined') return
  try {
    if (g === null) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify(g))
  } catch {
    /* ignore */
  }
}

export function isGroupFresh(group: CurrentSessionGroup | null, now: number = Date.now()): boolean {
  if (!group) return false
  return now - group.lastEndAt <= GROUP_GAP_MS
}

export function finalizedSeconds(g: CurrentSessionGroup | null): number {
  if (!g) return 0
  return g.segments.reduce((sum, seg) => sum + seg.seconds, 0)
}

/** Add seconds to the last segment of the group. */
export function bumpLastSegment(g: CurrentSessionGroup, additionalSeconds: number): CurrentSessionGroup {
  if (g.segments.length === 0) return g
  const segments = [...g.segments]
  const tail = segments[segments.length - 1]
  segments[segments.length - 1] = { ...tail, seconds: Math.max(0, tail.seconds + additionalSeconds) }
  return { ...g, segments }
}

/** Add a new empty segment for a new subject (subject change). */
export function pushSegment(g: CurrentSessionGroup, subjectId: string): CurrentSessionGroup {
  const tail = g.segments[g.segments.length - 1]
  if (tail && tail.subjectId === subjectId) return g
  return { ...g, segments: [...g.segments, { subjectId, seconds: 0 }] }
}
/**
 * Reflect a manual edit of an already-saved session in the group.
 *
 * Saved time is folded into `segments` by the timer. When the user edits that
 * session (Edit Session modal / SessionDetailsModal) the group must move by the
 * same amount, or "Current Session" keeps showing the pre-edit total.
 *
 * The old duration is removed from the old subject's segment and the new
 * duration added to the new subject's segment (a plain duration change when the
 * subject is unchanged). Sessions that started before the group did were never
 * part of it and are ignored. `lastEndAt`/`active` are left alone so the edit
 * does not extend the merge window.
 */
export function adjustGroupForEditedSession(
  g: CurrentSessionGroup,
  edit: {
    sessionStartMs: number
    oldSubjectId: string
    oldSeconds: number
    newSubjectId: string
    newSeconds: number
  },
): CurrentSessionGroup {
  if (edit.sessionStartMs < g.startedAt - EDIT_START_TOLERANCE_MS) return g
  const sameSubject = edit.oldSubjectId === edit.newSubjectId
  if (sameSubject && edit.oldSeconds === edit.newSeconds) return g
  const oldIndex = [...g.segments].map((seg, index) => seg.subjectId === edit.oldSubjectId ? index : -1).reverse().find((index) => index >= 0) ?? -1
  const newIndex = [...g.segments].map((seg, index) => seg.subjectId === edit.newSubjectId ? index : -1).reverse().find((index) => index >= 0) ?? -1
  if (oldIndex < 0 && newIndex < 0) return g
  const segments = g.segments.map((seg, index) => {
    let delta = 0
    if (index === oldIndex) delta -= edit.oldSeconds
    if (index === newIndex) delta += edit.newSeconds
    return delta === 0 ? seg : { ...seg, seconds: Math.max(0, seg.seconds + delta) }
  })
  if (newIndex < 0) segments.push({ subjectId: edit.newSubjectId, seconds: edit.newSeconds })
  return { ...g, segments }
}

export const GROUP_EDITED_EVENT = 'momentum:current-session-edit'

interface EditableSession {
  startAt: string
  subjectId: string
  durationMinutes: number
  durationSeconds?: number
}

function secondsOf(s: EditableSession): number {
  return s.durationSeconds ?? s.durationMinutes * 60
}

/**
 * Persist the effect of a manual session edit on the stored group, then tell
 * any mounted timer widget to re-read it. Writing storage here (rather than
 * only notifying the widget) keeps the edit from being lost when the timer
 * widget is not mounted on the current page.
 */
export function applySessionEditToGroup(before: EditableSession, after: EditableSession): void {
  const g = loadGroup()
  if (!g) return
  const next = adjustGroupForEditedSession(g, {
    sessionStartMs: new Date(before.startAt).getTime(),
    oldSubjectId: before.subjectId,
    oldSeconds: secondsOf(before),
    newSubjectId: after.subjectId,
    newSeconds: secondsOf(after),
  })
  if (next === g) return
  saveGroup(next)
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(GROUP_EDITED_EVENT))
}
