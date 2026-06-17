// Cloud sync service for study sessions.
// Mirrors local IndexedDB sessions to Firestore so they can be shared in groups.
// Includes an offline queue backed by localStorage — pending syncs replay on reconnect.
//
// All functions are no-ops if Firebase is not configured.
import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  writeBatch,
} from 'firebase/firestore'
import { recordWrites, hasBudgetFor } from './write-budget'
import { db, isFirebaseConfigured } from './firebase'
import { isoNow } from './utils'
import type { SyncedSession } from '../domain/cloud-types'

const QUEUE_KEY = 'momentum-sync-queue'

interface PendingOp {
  type: 'upsert' | 'delete'
  session: SyncedSession
  ts: number
}

function loadQueue(): PendingOp[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as PendingOp[]
  } catch {
    return []
  }
}

function saveQueue(queue: PendingOp[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
}

/** Compute member stats from a list of sessions. */
function computeMemberStats(
  sessions: SyncedSession[],
  uid: string,
  displayName: string,
  photoURL: string | null,
  groupId: string
) {
  const own = sessions.filter((s) => s.uid === uid)
  const now = new Date()
  const weekStart = new Date(now)
  // Monday = 1 in JS getDay()
  const dayOfWeek = (now.getDay() + 6) % 7
  weekStart.setDate(now.getDate() - dayOfWeek)
  weekStart.setHours(0, 0, 0, 0)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)

  const totalMinutes = own.reduce((sum, s) => sum + s.minutes, 0)
  const todayMinutes = own
    .filter((s) => new Date(s.startAt) >= todayStart)
    .reduce((sum, s) => sum + s.minutes, 0)
  const weekMinutes = own
    .filter((s) => new Date(s.startAt) >= weekStart)
    .reduce((sum, s) => sum + s.minutes, 0)
  const monthMinutes = own
    .filter((s) => new Date(s.startAt) >= monthStart)
    .reduce((sum, s) => sum + s.minutes, 0)

  // Compute current streak
  const dateSet = new Set(own.map((s) => s.startAt.slice(0, 10)))
  let streak = 0
  const cur = new Date()
  while (true) {
    const ds = cur.toISOString().slice(0, 10)
    if (dateSet.has(ds)) {
      streak++
      cur.setDate(cur.getDate() - 1)
    } else {
      break
    }
  }

  const lastSessionAt = own
    .map((s) => s.startAt)
    .sort()
    .pop() ?? null
  return {
    uid,
    displayName,
    photoURL,
    groupId,
    currentStreak: streak,
    todayMinutes,
    weekMinutes,
    monthMinutes,
    totalMinutes,
    totalSessions: own.length,
    lastSessionAt,
    updatedAt: isoNow(),
  }
}

export const syncService = {
  /** Enqueue an upsert for a session. Returns immediately; flushed in background. */
  enqueueUpsert(session: SyncedSession) {
    if (!isFirebaseConfigured || !db) return
    const queue = loadQueue()
    queue.push({ type: 'upsert', session, ts: Date.now() })
    saveQueue(queue)
  },

  enqueueDelete(session: SyncedSession) {
    if (!isFirebaseConfigured || !db) return
    const queue = loadQueue()
    queue.push({ type: 'delete', session, ts: Date.now() })
    saveQueue(queue)
  },

  /** Flush pending ops to Firestore. */
  async flush(): Promise<void> {
    if (!isFirebaseConfigured || !db) return
    const firestore = db
    const queue = loadQueue()
    if (queue.length === 0) return
    const remaining: PendingOp[] = []

    const batch = writeBatch(firestore)
    let writeCount = 0
    for (const op of queue) {
      try {
        if (!hasBudgetFor(1)) {
          // Keep the rest in the queue for tomorrow's reset
          remaining.push(op)
          continue
        }
        if (op.type === 'upsert') {
          const ref = doc(firestore, 'sessions', op.session.id)
          batch.set(ref, op.session, { merge: true })
        } else {
          const ref = doc(firestore, 'sessions', op.session.id)
          batch.delete(ref)
        }
        writeCount++
      } catch (e) {
        // Keep this op in the queue for retry
        remaining.push(op)
        console.error('Sync op failed, will retry', e)
      }
    }
    if (writeCount === 0) {
      saveQueue(remaining)
      return
    }
    try {
      await batch.commit()
      recordWrites(writeCount)
    } catch (e) {
      // Network failure — keep entire queue
      console.error('Sync batch failed', e)
      saveQueue(queue)
      return
    }
    saveQueue(remaining)
  },
  async fetchUserSessions(uid: string): Promise<SyncedSession[]> {
    if (!isFirebaseConfigured || !db) return []
    const firestore = db
    const q = query(collection(firestore, 'sessions'), where('uid', '==', uid))
    const snap = await getDocs(q)
    return snap.docs.map((d) => d.data() as SyncedSession)
  },

  /** Fetch all sessions for a group — every member's sessions. */
  async fetchGroupSessions(_groupId: string, memberUids: string[]): Promise<SyncedSession[]> {
    if (!isFirebaseConfigured || !db) return []
    if (memberUids.length === 0) return []
    const firestore = db
    // Firestore `in` queries support up to 30 values
    const chunks: string[][] = []
    for (let i = 0; i < memberUids.length; i += 30) {
      chunks.push(memberUids.slice(i, i + 30))
    }
    const all: SyncedSession[] = []
    for (const chunk of chunks) {
      const q = query(collection(firestore, 'sessions'), where('uid', 'in', chunk))
      const snap = await getDocs(q)
      snap.forEach((d) => all.push(d.data() as SyncedSession))
    }
    return all
  },

  /** Recompute and persist stats for a single member. */
  async refreshMemberStats(
    groupId: string,
    uid: string,
    displayName: string,
    photoURL: string | null,
    sessions: SyncedSession[]
  ) {
    if (!isFirebaseConfigured || !db) return
    const firestore = db
    const stats = computeMemberStats(sessions, uid, displayName, photoURL, groupId)
    const ref = doc(firestore, 'groupStats', `${groupId}_${uid}`)
    await setDoc(ref, stats, { merge: true })
    return stats
  },
}

/** Auto-flush on reconnect. */
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('[Sync] Back online, flushing pending ops...')
    void syncService.flush()
  })
}
