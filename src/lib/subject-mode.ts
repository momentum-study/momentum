/**
 * Sentinel ID for a "match any subject" mode on a Project or Routine.
 *
 * When a project or routine is configured with this subjectId, its totals
 * accumulate time from ALL subjects — useful for catch-all routines like
 * "Homework" that span multiple focus areas. This is purely a data
 * convention; no real Subject record is created.
 *
 * Subject picker UIs MUST surface this as a selectable "Any subject" option
 * when creating/editing projects or routines, and session-matching logic
 * MUST treat it as a wildcard.
 */
export const ANY_SUBJECT_ID = '__any__'

/** True when a subject reference is the "any subject" sentinel. */
export function isAnySubject(subjectId: string | null | undefined): boolean {
  return subjectId === ANY_SUBJECT_ID
}

/** True when a routine/project configured for anySubject should match this session. */
export function matchesAnySubject(routineSubjectId: string | null | undefined): boolean {
  return isAnySubject(routineSubjectId)
}
