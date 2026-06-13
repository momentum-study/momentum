// Hook for auto-syncing study sessions to Firestore cloud.
// Called from PomodoroTimer and Dashboard after saving a session locally.
// No-ops when Firebase is not configured or the user is not signed in.
import { useAuth } from '../app/auth-provider'
import { syncService } from './sync-service'
import type { SyncedSession } from '../domain/cloud-types'

interface LocalSession {
  id: string
  subjectId: string
  startAt: string
  endAt?: string
  durationMinutes: number
  createdAt: string
}

export function useSessionSync() {
  const { user } = useAuth()

  /** Sync a locally-saved session to the cloud. No-op if not signed in. */
  function syncSession(session: LocalSession, subjectName: string) {
    if (!user) return
    const synced: SyncedSession = {
      id: session.id,
      uid: user.uid,
      subjectName,
      minutes: session.durationMinutes,
      startAt: session.startAt,
      endAt: session.endAt,
      createdAt: session.createdAt,
    }
    syncService.enqueueUpsert(synced)
    // Flush in the background — don't block the UI
    void syncService.flush()
  }

  /** Sync a session deletion to the cloud. */
  function syncSessionDelete(sessionId: string) {
    if (!user) return
    // Build a minimal placeholder for the delete record
    const stub: SyncedSession = {
      id: sessionId,
      uid: user.uid,
      subjectName: '',
      minutes: 0,
      startAt: '',
      createdAt: '',
    }
    syncService.enqueueDelete(stub)
    void syncService.flush()
  }

  return { syncSession, syncSessionDelete }
}
