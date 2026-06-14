// Auto-tracking: when a study session is saved, update today's RoutineLog
// for any Routine whose day + subject (+project) matches the session.
import { v4 as uuid } from 'uuid'
import { db } from '../db/app-db'
import type { Session, RoutineLog, DayOfWeek } from '../domain/types'
import { isoNow } from './utils'

/**
 * For the given session, find all matching routines (today's day + same subject
 * + same project-or-any) and update today's RoutineLog for each by adding the
 * session's minutes. Creates the log if it doesn't exist yet.
 */
export async function updateRoutineLogsForSession(session: Session): Promise<void> {
  const sessionDate = session.startAt.slice(0, 10) // YYYY-MM-DD
  const sessionDow = new Date(session.startAt).getDay() as DayOfWeek

  const allRoutines = await db.routines.toArray()
  const matching = allRoutines.filter((r) => {
    if (r.deletedAt) return false
    if (!r.days.includes(sessionDow)) return false
    if (r.subjectId !== session.subjectId) return false
    if (r.projectId && r.projectId !== session.projectId) return false
    return true
  })

  if (matching.length === 0) return

  // Find existing log per matching routine
  const logs = await db.routineLogs.toArray()
  for (const routine of matching) {
    const existing = logs.find((l) => l.routineId === routine.id && l.date === sessionDate)
    const addedMinutes = existing
      ? existing.actualMinutes + session.durationMinutes
      : session.durationMinutes
    const completed = addedMinutes >= routine.targetMinutes

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
  const sessionDate = session.startAt.slice(0, 10)
  const sessionDow = new Date(session.startAt).getDay() as DayOfWeek

  const allRoutines = await db.routines.toArray()
  const matching = allRoutines.filter((r) => {
    if (r.deletedAt) return false
    if (!r.days.includes(sessionDow)) return false
    if (r.subjectId !== session.subjectId) return false
    if (r.projectId && r.projectId !== session.projectId) return false
    return true
  })

  if (matching.length === 0) return

  const logs = await db.routineLogs.toArray()
  for (const routine of matching) {
    const existing = logs.find((l) => l.routineId === routine.id && l.date === sessionDate)
    if (!existing) continue
    const remaining = Math.max(0, existing.actualMinutes - session.durationMinutes)
    await db.routineLogs.update(existing.id, {
      actualMinutes: remaining,
      completed: remaining >= routine.targetMinutes,
    })
  }
}
