// Auto-tracking: when a study session is saved, update today's RoutineLog
// for any Routine whose day + subject (+project) matches the session.
import { v4 as uuid } from 'uuid'
import { matchesAnySubject } from './subject-mode'
import { db } from '../db/app-db'
import type { Session, Routine, RoutineLog, StreakDay, DayOfWeek } from '../domain/types'
import { getSessionScope, isoNow, sessionLocalDate } from './utils'
import { loadSettings } from './settings-store'

/**
 * ISO-string bounds that cover every local timestamp that maps to the given
 * logical study day (§10.73). With dayStartHour H, the day includes
 * [00:00, H) of the *following* calendar day, so the end bound extends H
 * hours past midnight. Stored sessions with pre-dawn startAt fall inside.
 */
function dayQueryBounds(dateKey: string, dayStartHour: number): { start: string; end: string } {
  const start = new Date(`${dateKey}T00:00:00`)
  // The pre-dawn tail of the NEXT calendar day logically belongs to dateKey.
  const end = new Date(start.getTime() + (24 + dayStartHour) * 3_600_000 - 1)
  return { start: start.toISOString(), end: end.toISOString() }
}

/**
 * Which routines a session's minutes belong to. THE single decision shared by
 * `updateRoutineLogsForSession` (add) and `revertRoutineLogsForSession`
 * (subtract) — the two MUST agree or deleting a session will corrupt a log it
 * never contributed to (§10.81):
 * - Explicit `routineId` (timer dropdown): logs toward exactly that routine,
 *   including when `source === 'activity'` (schedule mark-done and catch-up set
 *   both deliberately).
 * - `autoRoutine`: auto-matched routines scheduled for this day + subject +
 *   project-or-any.
 * - Everything else (manual, timer without a routine pick, quickLog, activity
 *   without a routine): nothing. Attending an activity is not the same as
 *   completing the study block it happens to share a subject with (§10.63).
 */
/** Routines auto-matched by day + subject (or any-subject) + project-or-any. */
function autoMatchedRoutines(session: Session, allRoutines: Routine[], sessionDow: DayOfWeek): Routine[] {
  return allRoutines.filter((r) => {
    if (r.deletedAt) return false
    if (!r.dayMinutes[sessionDow] || r.dayMinutes[sessionDow]! <= 0) return false
    if (!matchesAnySubject(r.subjectId) && r.subjectId !== session.subjectId) return false
    if (r.projectId && r.projectId !== session.projectId) return false
    return true
  })
}

function routinesForSession(session: Session, allRoutines: Routine[], sessionDow: DayOfWeek): Routine[] {
  if (session.routineId) {
    return allRoutines.filter((r) => r.id === session.routineId && !r.deletedAt)
  }
  if (session.source !== 'autoRoutine') return []
  return autoMatchedRoutines(session, allRoutines, sessionDow)
}

/**
 * For the given session, find all matching routines (today's day + same subject
 * + same project-or-any) and update today's RoutineLog for each by adding the
 * session's minutes. Creates the log if it doesn't exist yet.
 */
export async function updateRoutineLogsForSession(session: Session): Promise<void> {
  const subjects = await db.subjects.toArray()
  const categories = await db.categories.toArray()
  if (getSessionScope(session, subjects, categories) !== 'academic') return
  const sessionDate = sessionLocalDate(session.startAt) // YYYY-MM-DD
  const sessionDow = new Date(session.startAt).getDay() as DayOfWeek

  const allRoutines = await db.routines.toArray()
  const autoMatch = autoMatchedRoutines(session, allRoutines, sessionDow)
  // Only tag auto-routine sessions — manually created sessions should not
  // be silently assigned to a routine.
  if (autoMatch.length > 0 && !session.routineId && session.source === 'autoRoutine') {
    await db.sessions.update(session.id, { routineId: autoMatch[0].id, updatedAt: isoNow() })
  }

  // The shared decision (§10.81): explicit routineId wins, auto-match applies
  // only to autoRoutine sessions, everything else logs nothing.
  const toLog = routinesForSession(session, allRoutines, sessionDow)

  const logs = await db.routineLogs.toArray()
  for (const routine of toLog) {
    const existing = logs.find((l) => l.routineId === routine.id && l.date === sessionDate)
    const addedMinutes = existing
      ? existing.actualMinutes + session.durationMinutes
      : session.durationMinutes
    const targetMinutes = routine.dayMinutes[sessionDow]
    const completed = targetMinutes !== undefined && targetMinutes > 0 && addedMinutes >= targetMinutes

    if (existing) {
      await db.routineLogs.update(existing.id, {
        actualMinutes: addedMinutes,
        completed,
      })
    } else {
      const newLog: RoutineLog = {
        id: uuid(),
        routineId: routine.id,
        date: sessionDate,
        actualMinutes: addedMinutes,
        completed,
        createdAt: isoNow(),
      }
      await db.routineLogs.add(newLog)
    }
  }
}
/** Subtract a session's minutes from any matching routine logs. Used on delete. */
export async function revertRoutineLogsForSession(session: Session): Promise<void> {
  const subjects = await db.subjects.toArray()
  const categories = await db.categories.toArray()
  if (getSessionScope(session, subjects, categories) !== 'academic') return
  const sessionDate = sessionLocalDate(session.startAt)
  const sessionDow = new Date(session.startAt).getDay() as DayOfWeek
  const allRoutines = await db.routines.toArray()
  // MUST mirror `updateRoutineLogsForSession` — see routinesForSession (§10.81).
  const matching = routinesForSession(session, allRoutines, sessionDow)
  if (matching.length === 0) return
  const logs = await db.routineLogs.toArray()
  for (const routine of matching) {
    const existing = logs.find((l) => l.routineId === routine.id && l.date === sessionDate)
    if (!existing) continue
    const remaining = Math.max(0, existing.actualMinutes - session.durationMinutes)
    await db.routineLogs.update(existing.id, {
      actualMinutes: remaining,
      completed: (() => {
        const target = routine.dayMinutes[sessionDow]
        return target !== undefined && target > 0 && remaining >= target
      })(),
    })
  }
}

/**
 * When a session is saved, recalculate the StreakDay for the session's date.
 * Sums all academic session minutes for that date and compares against the
 * user's dailyTargetMinutes setting. Upserts the StreakDay record.
 */
export async function updateStreakDayForSession(session: Session): Promise<void> {
  const subjects = await db.subjects.toArray()
  const categories = await db.categories.toArray()
  if (getSessionScope(session, subjects, categories) !== 'academic') return

  const dateKey = sessionLocalDate(session.startAt) // YYYY-MM-DD
  const settings = loadSettings()
  const target = settings.dailyTargetMinutes

  // Use the startAt index to bound the query to just this logical day (§10.73)
  // instead of pulling the entire sessions table. Avoids O(n) scans.
  const { start: dayStart, end: dayEnd } = dayQueryBounds(dateKey, settings.dayStartHour)
  const todaysSessions = await db.sessions
    .where('startAt')
    .between(dayStart, dayEnd, true, true)
    .toArray()

  let totalMinutes = 0
  for (const s of todaysSessions) {
    if (s.deletedAt) continue
    if (getSessionScope(s, subjects, categories) !== 'academic') continue
    totalMinutes += s.durationMinutes
  }

  const goalMet = totalMinutes >= target
  const existing = await db.streakDays.get(dateKey)

  if (existing) {
    await db.streakDays.update(dateKey, { totalMinutes, goalMet })
  } else {
    const streakDay: StreakDay = {
      id: dateKey,
      totalMinutes,
      goalMet,
      createdAt: isoNow(),
    }
    await db.streakDays.add(streakDay)
  }
}

/**
 * When a session is deleted, recalculate the StreakDay for the session's date.
 * If no academic sessions remain for that date, remove the StreakDay record.
 */
export async function revertStreakDayForSession(session: Session): Promise<void> {
  const subjects = await db.subjects.toArray()
  const categories = await db.categories.toArray()
  if (getSessionScope(session, subjects, categories) !== 'academic') return

  const dateKey = sessionLocalDate(session.startAt)
  const settings = loadSettings()
  const target = settings.dailyTargetMinutes

  const { start: dayStart, end: dayEnd } = dayQueryBounds(dateKey, settings.dayStartHour)
  const todaysSessions = await db.sessions
    .where('startAt')
    .between(dayStart, dayEnd, true, true)
    .toArray()

  let totalMinutes = 0
  for (const s of todaysSessions) {
    if (s.deletedAt) continue
    if (s.id === session.id) continue // exclude the deleted session
    if (getSessionScope(s, subjects, categories) !== 'academic') continue
    totalMinutes += s.durationMinutes
  }

  const existing = await db.streakDays.get(dateKey)
  if (totalMinutes === 0 && existing) {
    await db.streakDays.delete(dateKey)
  } else if (existing) {
    const goalMet = totalMinutes >= target
    await db.streakDays.update(dateKey, { totalMinutes, goalMet })
  }
}
/**
 * Recompute streak days for a set of dates after bulk session soft-deletes
 * (e.g. subject/category delete cascade). For each date, re-sums all active
 * academic session minutes and updates or removes the StreakDay record.
 */
export async function recomputeStreakDaysForDates(dateKeys: string[]): Promise<void> {
  if (dateKeys.length === 0) return
  const subjects = await db.subjects.toArray()
  const categories = await db.categories.toArray()
  const settings = loadSettings()
  const target = settings.dailyTargetMinutes

  for (const dateKey of dateKeys) {
    const { start: dayStart, end: dayEnd } = dayQueryBounds(dateKey, settings.dayStartHour)
    const todaysSessions = await db.sessions
      .where('startAt')
      .between(dayStart, dayEnd, true, true)
      .toArray()

    let totalMinutes = 0
    for (const s of todaysSessions) {
      if (s.deletedAt) continue
      if (getSessionScope(s, subjects, categories) !== 'academic') continue
      totalMinutes += s.durationMinutes
    }

    const existing = await db.streakDays.get(dateKey)
    if (totalMinutes === 0 && existing) {
      await db.streakDays.delete(dateKey)
    } else if (existing) {
      await db.streakDays.update(dateKey, { totalMinutes, goalMet: totalMinutes >= target })
    } else if (totalMinutes > 0) {
      await db.streakDays.add({
        id: dateKey,
        totalMinutes,
        goalMet: totalMinutes >= target,
        createdAt: isoNow(),
      })
    }
  }
}
