// Full data sync: mirrors local Dexie tables ↔ Firestore user/{uid}/data/{table}.
// On sign-in, pulls cloud data and merges into local DB.
// On mutations, pushes changed records to Firestore.
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { db as firestore, isFirebaseConfigured } from './firebase'
import { db as localDb } from '../db/app-db'
import { isoNow } from './utils'
import type { AppData } from '../app/providers'

type TableKey = keyof AppData

const DATA_COLLECTION = 'userData'
/** Firestore rejects `undefined` field values. Strip them recursively before setDoc. */
function stripUndefined<T>(value: T): T {
  if (value === null || value === undefined) return value
  if (Array.isArray(value)) {
    return value.map(stripUndefined) as unknown as T
  }
  if (typeof value === 'object' && value.constructor === Object) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[k] = stripUndefined(v)
    }
    return out as T
  }
  return value
}


/** All table names to sync. */
export const SYNC_TABLES: TableKey[] = [
  'categories',
  'subjects',
  'projects',
  'tasks',
  'sessions',
  'progressLogs',
  'marks',
  'assignments',
  'habits',
  'habitLogs',
  'streakDays',
  'routines',
  'routineLogs',
]

interface CloudTableDoc {
  uid: string
  tableName: string
  records: unknown[]
  updatedAt: string
}

// ────────── Pull: Firestore → local Dexie ──────────

/** Pull all synced tables from Firestore and write to local DB. Returns count of records written. */
export async function pullAllData(uid: string): Promise<number> {
  if (!isFirebaseConfigured || !firestore) return 0
  let total = 0

  beginSync()
  try {
    for (const tableKey of SYNC_TABLES) {
      try {
        const snap = await getDoc(doc(firestore, DATA_COLLECTION, `${uid}_${tableKey}`))
        if (!snap.exists()) continue
        const cloudDoc = snap.data() as CloudTableDoc
        if (!Array.isArray(cloudDoc.records) || cloudDoc.records.length === 0) continue

        const table = localDb.table(tableKey)
        await table.bulkPut(cloudDoc.records as { id: string }[])
        total += cloudDoc.records.length
      } catch (e) {
        console.warn(`Failed to pull table ${tableKey}:`, e)
      }
    }
  } finally {
    endSync()
  }
  return total
}

// ────────── Push: local Dexie → Firestore ──────────

/** Push a single table's entire contents to Firestore. */
export async function pushTable(uid: string, tableKey: TableKey): Promise<void> {
  if (!isFirebaseConfigured || !firestore) return
  try {
    const records = (await localDb.table(tableKey).toArray())
    if (records.length === 0) return
    await setDoc(doc(firestore, DATA_COLLECTION, `${uid}_${tableKey}`), {
      uid,
      tableName: tableKey,
      records: records.map(stripUndefined),
      updatedAt: isoNow(),
    } satisfies CloudTableDoc)
    console.log(`[sync] Pushed ${tableKey}: ${records.length} records`)
  } catch (e) {
    console.error(`[sync] Failed to push ${tableKey}:`, e)
  }
}
export async function pushAllData(uid: string): Promise<void> {
  for (const tableKey of SYNC_TABLES) {
    await pushTable(uid, tableKey)
  }
  console.log(`[sync] Pushed ${SYNC_TABLES.length} tables to cloud`)
}

/** DEPRECATED: per-record push is replaced by debounced table push via markDirty().
 * Kept as a fallback for callers that need an immediate single-record push. */
export async function pushRecord(uid: string, tableKey: TableKey, record: unknown): Promise<void> {
  if (!isFirebaseConfigured || !firestore) return
  try {
    const docId = `${uid}_${tableKey}`
    const snap = await getDoc(doc(firestore, DATA_COLLECTION, docId))
    let records: unknown[] = []
    if (snap.exists()) {
      const existing = snap.data() as CloudTableDoc
      records = Array.isArray(existing.records) ? existing.records : []
    }
    const rec = record as { id: string }
    const idx = records.findIndex((r) => (r as { id: string }).id === rec.id)
    if (idx >= 0) records[idx] = rec
    else records.push(rec)

    await setDoc(doc(firestore, DATA_COLLECTION, docId), {
      uid,
      tableName: tableKey,
      records,
      updatedAt: isoNow(),
    })
  } catch (e) {
    console.warn(`Failed to push record to ${tableKey}:`, e)
  }
}

export async function pushFullBackup(uid: string): Promise<void> {
  await pushAllData(uid)
}

// ────────── Dexie hooks: auto-push on every local mutation ──────────
// Hooks are installed once on module load. The activeSyncUid flag gates
// whether they actually push to Firestore (set on sign-in, cleared on sign-out).

let activeSyncUid: string | null = null
/** Guard: when true, local Dexie hooks suppress push (cloud-initiated writes). */
let isSyncing = false
/** Call before a cloud-initiated bulkPut / bulkAdd to suppress push hooks. */
export function beginSync() { isSyncing = true }
export function endSync() { isSyncing = false }

/** Enable sync hooks for the given user. */
export function installSyncHooks(uid: string) {
  activeSyncUid = uid
}

/** Disable all sync hooks. */
export function uninstallSyncHooks() {
  activeSyncUid = null
}

// ────────── Debounced push: coalesce rapid mutations into one table push ──────────
// Instead of pushing each record individually (getDoc + setDoc per mutation),
// dirty tables are flushed as a whole after a short delay. This avoids
// downloading/re-uploading the entire table array on every single click.

const dirtyTables = new Set<TableKey>()
let flushTimer: ReturnType<typeof setTimeout> | null = null
const FLUSH_DELAY = 500 // coalesce mutations within 500ms

function markDirty(tableKey: TableKey) {
  if (!activeSyncUid) return
  dirtyTables.add(tableKey)
  if (!flushTimer) {
    flushTimer = setTimeout(flushDirtyTables, FLUSH_DELAY)
  }
}

/** Flush pending dirty tables immediately (used on page close / tab hide). */
export function flushNow() {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  if (!activeSyncUid || dirtyTables.size === 0) return
  const tables = [...dirtyTables]
  dirtyTables.clear()
  for (const tableKey of tables) {
    void pushTable(activeSyncUid, tableKey)
  }
}

async function flushDirtyTables() {
  flushTimer = null
  if (!activeSyncUid || dirtyTables.size === 0) return
  const tables = [...dirtyTables]
  dirtyTables.clear()
  for (const tableKey of tables) {
    await pushTable(activeSyncUid, tableKey)
  }
}

// Install hooks once — they check activeSyncUid at call time.
if (typeof window !== 'undefined') {
  for (const tableKey of SYNC_TABLES) {
    localDb.table(tableKey).hook('creating', () => {
      if (!isSyncing && activeSyncUid) markDirty(tableKey)
    })
    localDb.table(tableKey).hook('updating', () => {
      if (!isSyncing && activeSyncUid) markDirty(tableKey)
    })
    localDb.table(tableKey).hook('deleting', () => {
      if (!isSyncing && activeSyncUid) markDirty(tableKey)
    })
  }

  // Flush pending changes when the tab is hidden (user switches to another tab/device).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushNow()
  })

  // Flush pending changes before the page unloads.
  window.addEventListener('beforeunload', () => {
    flushNow()
  })
}

/**
 * Subscribe to real-time updates from the cloud.
 * Whenever any synced table changes on the server, pull the change into local DB
 * and dispatch a 'momentum-data-synced' event so the UI refreshes.
 */
export function subscribeToUserData(uid: string): Unsubscribe {
  if (!isFirebaseConfigured || !firestore) {
    console.warn('[sync] Firebase not configured, skipping subscription')
    return () => {}
  }
  console.log(`[sync] Subscribing to ${SYNC_TABLES.length} tables for ${uid}`)
  const unsubscribers: Unsubscribe[] = []
  for (const tableKey of SYNC_TABLES) {
    const docRef = doc(firestore, DATA_COLLECTION, `${uid}_${tableKey}`)
    const unsub = onSnapshot(
      docRef,
      async (snap) => {
        if (!snap.exists()) return
        const cloudDoc = snap.data() as CloudTableDoc
        if (!Array.isArray(cloudDoc.records) || cloudDoc.records.length === 0) return
        console.info(`[sync] Applying ${cloudDoc.records.length} records to ${tableKey}`)
        try {
          beginSync()
          const table = localDb.table(tableKey)
          await table.bulkPut(cloudDoc.records as { id: string }[])
          window.dispatchEvent(new CustomEvent('momentum-data-synced', { detail: { source: 'cloud' } }))
        } catch (e) {
          console.warn(`[sync] Failed to apply ${tableKey}:`, e)
        } finally {
          endSync()
        }
      },
      (err) => {
        console.warn(`[sync] Snapshot error ${tableKey}:`, err)
      }
    )
    unsubscribers.push(unsub)
  }
  return () => {
    for (const u of unsubscribers) u()
  }
}
