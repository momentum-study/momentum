// Hook for auto-syncing study sessions to Firestore cloud.
// Called from PomodoroTimer and Dashboard after saving a session locally.
// No-ops when Firebase is not configured or the user is not signed in.
//
// The cloud SDK is loaded on demand: this hook is imported by the boot path
// (Dashboard, timer widgets), and statically importing the Firebase SDK
// there would add ~470 kB to the first-load bundle.
import { useAuth } from '../app/auth-provider'
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
    void import('./sync-service').then(({ syncService }) => {
      syncService.enqueueUpsert(synced)
      // Flush in the background — don't block the UI
      void syncService.flush()
    })
  }

  /** Sync a session deletion to the cloud. */
  async function syncSessionDelete(sessionId: string) {
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
    const [{ syncService }, { groupService }] = await Promise.all([
      import('./sync-service'),
      import('./group-service'),
    ])
    syncService.enqueueDelete(stub)
    await syncService.flush()

    // Refresh group stats after delete
    const groups = await groupService.listMyGroups(user.uid)
    const sessions = await syncService.fetchUserSessions(user.uid)
    for (const group of groups) {
      await syncService.refreshMemberStats(group.id, user.uid, user.displayName ?? 'Unknown', user.photoURL ?? null, sessions)
    }
  }

  return { syncSession, syncSessionDelete }
}
