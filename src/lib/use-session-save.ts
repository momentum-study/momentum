import { useCallback } from 'react'
import { db } from '../db/app-db'
import { updateRoutineLogsForSession, updateStreakDayForSession } from './routine-tracker'
import { useSessionSync } from './use-session-sync'
import { useData } from '../app/providers'
import type { Session } from '../domain/types'

/**
 * Persist a study session and update all derived data (routine logs, streaks).
 * Returns the DB add result (the session id).
 */
export async function createSession(session: Session, _subjectName: string) {
  await db.sessions.add(session)
  await Promise.all([
    updateRoutineLogsForSession(session),
    updateStreakDayForSession(session),
  ])
}

/**
 * React hook that returns a `createSession` function with cloud sync and
 * data reload wired in. Drop-in replacement for the 5-line save pattern
 * repeated across timer components.
 */
export function useSessionSave() {
  const { syncSession } = useSessionSync()
  const { loadData } = useData()

  const save = useCallback(
    async (session: Session, subjectName: string) => {
      await createSession(session, subjectName)
      syncSession(session, subjectName)
      await loadData()
    },
    [syncSession, loadData],
  )

  return save
}
