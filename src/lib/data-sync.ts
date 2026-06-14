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

  for (const tableKey of SYNC_TABLES) {
    try {
      const snap = await getDoc(doc(firestore, DATA_COLLECTION, `${uid}_${tableKey}`))
      if (!snap.exists()) continue
      const cloudDoc = snap.data() as CloudTableDoc
      if (!Array.isArray(cloudDoc.records) || cloudDoc.records.length === 0) continue

      // Merge: upsert each record by id (cloud wins on conflict)
      const table = localDb.table(tableKey)
      await table.bulkPut(cloudDoc.records as { id: string }[])
      total += cloudDoc.records.length
    } catch (e) {
      console.warn(`Failed to pull table ${tableKey}:`, e)
    }
  }
  return total
}

// ────────── Push: local Dexie → Firestore ──────────

/** Push a single table's entire contents to Firestore. */
export async function pushTable(uid: string, tableKey: TableKey): Promise<void> {
  if (!isFirebaseConfigured || !firestore) return
  try {
    const records = await localDb.table(tableKey).toArray()
    await setDoc(doc(firestore, DATA_COLLECTION, `${uid}_${tableKey}`), {
      uid,
      tableName: tableKey,
      records,
      updatedAt: isoNow(),
    } satisfies CloudTableDoc)
  } catch (e) {
    console.warn(`Failed to push table ${tableKey}:`, e)
  }
}

/** Push all tables to Firestore. Used on bulk import or sign-out snapshot. */
export async function pushAllData(uid: string): Promise<void> {
  for (const tableKey of SYNC_TABLES) {
    await pushTable(uid, tableKey)
  }
}

/** Push a single record to its table in Firestore (incremental sync). */
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
    // Upsert by id
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

/** Remove a single record from the cloud table. */
export async function removeRecord(uid: string, tableKey: TableKey, recordId: string): Promise<void> {
  if (!isFirebaseConfigured || !firestore) return
  try {
    const docId = `${uid}_${tableKey}`
    const snap = await getDoc(doc(firestore, DATA_COLLECTION, docId))
    if (!snap.exists()) return
    const existing = snap.data() as CloudTableDoc
    const records = (Array.isArray(existing.records) ? existing.records : [])
      .filter((r) => (r as { id: string }).id !== recordId)

    await setDoc(doc(firestore, DATA_COLLECTION, docId), {
      uid,
      tableName: tableKey,
      records,
      updatedAt: isoNow(),
    })
  } catch (e) {
    console.warn(`Failed to remove record ${recordId} from ${tableKey}:`, e)
  }
}

export async function pushFullBackup(uid: string): Promise<void> {
  await pushAllData(uid)
}

/**
 * Subscribe to real-time updates from the cloud.
 * Whenever any synced table changes on the server, pull the change into local DB
 * and dispatch a 'momentum-data-synced' event so the UI refreshes.
 */
export function subscribeToUserData(uid: string): Unsubscribe {
  if (!isFirebaseConfigured || !firestore) {
    return () => {}
  }
  const unsubscribers: Unsubscribe[] = []
  for (const tableKey of SYNC_TABLES) {
    const docRef = doc(firestore, DATA_COLLECTION, `${uid}_${tableKey}`)
    const unsub = onSnapshot(
      docRef,
      async (snap) => {
        if (!snap.exists()) return
        const cloudDoc = snap.data() as CloudTableDoc
        if (!Array.isArray(cloudDoc.records) || cloudDoc.records.length === 0) return
        try {
          const table = localDb.table(tableKey)
          await table.bulkPut(cloudDoc.records as { id: string }[])
          window.dispatchEvent(new CustomEvent('momentum-data-synced', { detail: { source: 'cloud' } }))
        } catch (e) {
          console.warn(`[sync] Failed to apply remote update for ${tableKey}:`, e)
        }
      },
      (err) => {
        console.warn(`[sync] Snapshot error for ${tableKey}:`, err)
      }
    )
    unsubscribers.push(unsub)
  }
  return () => {
    for (const u of unsubscribers) u()
  }
}
