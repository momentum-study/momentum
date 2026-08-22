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
