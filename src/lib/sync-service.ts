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
const BACKOFF_KEY = 'momentum-sync-backoff'
const MAX_BACKOFF_MS = 5 * 60 * 1000 // 5 min
// Promise-based mutex: all queue reads/writes and flush operations are
// serialized through a shared promise chain to prevent lost writes when
// multiple callers race on the localStorage-backed queue.
let _queueLock: Promise<unknown> = Promise.resolve()
function withQueueLock<T>(fn: () => T | Promise<T>): Promise<T> {
  const run = _queueLock.then(fn, fn) // run even if prior chain rejected
  _queueLock = run.then(() => {}, () => {}) // swallow error to unblock next
  return run
}

function getBackoffMs(): number {
  try {
    const raw = localStorage.getItem(BACKOFF_KEY)
    if (!raw) return 0
    const next = Number(raw)
    if (isNaN(next)) return 0
    return Math.max(0, next - Date.now())
  } catch { return 0 }
}

function setBackoff(attempts: number) {
  const delay = Math.min(MAX_BACKOFF_MS, 1000 * Math.pow(2, attempts))
  localStorage.setItem(BACKOFF_KEY, String(Date.now() + delay))
}

function clearBackoff() {
  localStorage.removeItem(BACKOFF_KEY)
}


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

/** Extract the local-date YYYY-MM-DD from an ISO timestamp. Consistent
 * with `todayStart`/`weekStart`/`monthStart` so streak agrees with the
 * today/week/month time-window totals. */
function localDateStr(iso: string): string {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
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
  const todaySessions = own.filter((s) => new Date(s.startAt) >= todayStart).length
  const weekSessions = own.filter((s) => new Date(s.startAt) >= weekStart).length
  const monthSessions = own.filter((s) => new Date(s.startAt) >= monthStart).length
  const todayMinutes = own
    .filter((s) => new Date(s.startAt) >= todayStart)
    .reduce((sum, s) => sum + s.minutes, 0)
  const weekMinutes = own
    .filter((s) => new Date(s.startAt) >= weekStart)
    .reduce((sum, s) => sum + s.minutes, 0)
  const monthMinutes = own
    .filter((s) => new Date(s.startAt) >= monthStart)
    .reduce((sum, s) => sum + s.minutes, 0)

  // Compute current streak using local-date strings so it agrees with the
  // today/week/month totals (which all use local-time boundaries).
  const dateSet = new Set(own.map((s) => localDateStr(s.startAt)))
  let streak = 0
  const cur = new Date()
  while (true) {
    const ds = localDateStr(cur.toISOString())
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
    todaySessions,
    weekSessions,
    monthSessions,
    totalSessions: own.length,
    lastSessionAt,
    updatedAt: isoNow(),
  }
}

  /** Flush pending ops to Firestore with exponential backoff on failure. */
export const syncService = {
  enqueueUpsert(session: SyncedSession) {
    if (!isFirebaseConfigured || !db) return
    withQueueLock(() => {
      const queue = loadQueue()
      queue.push({ type: 'upsert', session, ts: Date.now() })
      saveQueue(queue)
    })
  },

  enqueueDelete(session: SyncedSession) {
    if (!isFirebaseConfigured || !db) return
    withQueueLock(() => {
      const queue = loadQueue()
      queue.push({ type: 'delete', session, ts: Date.now() })
      saveQueue(queue)
    })
  },

  /**
   * Flush pending ops to Firestore.
   * Splits the queue into chunks of ≤500 ops (Firestore batch limit) and
   * saves only the remaining (failed) ops for retry, so successful ones
   * are not duplicated. Applies exponential backoff on consecutive failures.
   */
  async flush(): Promise<void> {
    return withQueueLock(async () => {
      if (!isFirebaseConfigured || !db) return
      // Respect backoff window
      const backoff = getBackoffMs()
      if (backoff > 0) {
        console.log(`[sync] Flush deferred (backoff: ${Math.round(backoff / 1000)}s)`)
        return
      }
      const firestore = db
      const queue = loadQueue()
      if (queue.length === 0) return

      const BATCH_LIMIT = 500
      let writeCount = 0
      let processed = 0
      let failed = false

      for (let start = 0; start < queue.length; start += BATCH_LIMIT) {
        const chunk = queue.slice(start, start + BATCH_LIMIT)
        const batch = writeBatch(firestore)
        const chunkOps: PendingOp[] = []
        let chunkWrites = 0

        for (const op of chunk) {
          if (!hasBudgetFor(1)) {
            chunkOps.push(op)
            continue
          }
          if (op.type === 'upsert') {
            const ref = doc(firestore, 'sessions', op.session.id)
            batch.set(ref, op.session, { merge: true })
          } else {
            const ref = doc(firestore, 'sessions', op.session.id)
            batch.delete(ref)
          }
          chunkWrites++
        }

        if (chunkWrites === 0) {
          saveQueue([...chunkOps, ...queue.slice(start + BATCH_LIMIT)])
          return
        }

        try {
          await batch.commit()
          recordWrites(chunkWrites)
          writeCount += chunkWrites
          processed += chunkWrites
        } catch (e) {
          failed = true
          console.error('Sync batch failed (will retry remaining ops):', e)
          saveQueue([...chunkOps, ...queue.slice(start + BATCH_LIMIT)])
          break
        }
      }

      if (processed > 0) clearBackoff()
      if (failed) {
        const attempts = Number(localStorage.getItem('momentum-sync-attempts') ?? '0') + 1
        localStorage.setItem('momentum-sync-attempts', String(attempts))
        setBackoff(attempts)
        console.warn(`[sync] Flush failed, backoff set (attempt ${attempts})`)
      }
      if (processed > 0 && !failed) {
        console.log(`[sync] Flushed ${writeCount} ops in ${Math.ceil(queue.length / BATCH_LIMIT)} batch(es)`)
        saveQueue([])
      } else if (!failed) {
        saveQueue(queue)
      }
    })
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

  // Flush any pending ops that survived a page close (e.g. browser kill mid-flush).
  // Also retry periodically while the page is open so backoff windows don't stall
  // the queue indefinitely.
  const pending = loadQueue()
  if (pending.length > 0) {
    console.log(`[Sync] ${pending.length} pending ops from previous session, flushing...`)
    void syncService.flush()
  }

  // Periodic retry: every 60s, flush any remaining queue (respects backoff).
  setInterval(() => {
    const q = loadQueue()
    if (q.length > 0) void syncService.flush()
  }, 60_000)
}