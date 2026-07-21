// Backup / restore helpers for Momentum's IndexedDB
import { db } from '../db/app-db'
import type { AppData } from '../app/providers'
import { loadSettings, saveSettings, type Settings } from '../features/settings/SettingsPage'

const EXPORT_VERSION = 2

export interface BackupPayload {
  app: 'momentum'
  version: number
  exportedAt: string
  data: Partial<AppData>
  settings?: Settings
}

const TABLE_KEYS: (keyof AppData)[] = [
  'categories',
  'subjects',
  'projects',
  'sessions',
  'progressLogs',
  'marks',
  'assignments',
  'habits',
  'habitLogs',
  'streakDays',
  'routines',
  'routineLogs',
  'activities',
  'activityLogs',
  'studyAreas',
  'studyReviews',
]

/** Read all data from the DB into a serialisable payload. */
export async function exportData(): Promise<BackupPayload> {
  const data: Partial<AppData> = {}
  for (const key of TABLE_KEYS) {
    try {
      data[key] = await db.table(key).toArray()
    } catch (e) {
      // Table may not exist in older schema versions; skip silently
      data[key] = []
    }
  }
  return {
    app: 'momentum',
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    data,
    settings: loadSettings(),
  }
}

/** Trigger a browser download of the current data as a JSON file. */
export async function downloadBackup(): Promise<void> {
  const payload = await exportData()
  const json = JSON.stringify(payload, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = payload.exportedAt.replace(/[:.]/g, '-').slice(0, 19)
  a.href = url
  a.download = `momentum-backup-${stamp}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Validate that a parsed object looks like a Momentum backup. */
export function isValidBackup(parsed: unknown): parsed is BackupPayload {
  if (!parsed || typeof parsed !== 'object') return false
  const p = parsed as Record<string, unknown>
  if (p.app !== 'momentum') return false
  if (typeof p.version !== 'number') return false
  if (!p.data || typeof p.data !== 'object') return false
  return true
}

/** Read a File selected by the user and parse it as a backup. */
export async function readBackupFile(file: File): Promise<BackupPayload> {
  const text = await file.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    throw new Error('Not a valid JSON file.')
  }
  if (!isValidBackup(parsed)) {
    throw new Error("This file is not a Momentum backup (missing 'app' or 'data').")
  }
  return parsed
}

export type ImportMode = 'merge' | 'replace'

/** Apply a backup payload to the DB. merge = bulkPut (overwrite by id). replace = clear then bulkPut. */
export async function importBackup(payload: BackupPayload, mode: ImportMode): Promise<{ counts: Record<string, number> }> {
  // Merge settings: preserve current settings keys missing in the backup;
  // for keys present in both, the backup version wins.
  if (payload.settings) {
    const current = loadSettings()
    saveSettings({ ...current, ...payload.settings })
  }
  // Replace mode: wipe the entire DB first
  if (mode === 'replace') await db.delete()
  const counts: Record<string, number> = {}
  for (const key of TABLE_KEYS) {
    const rows = payload.data[key]
    if (!Array.isArray(rows)) continue
    if (rows.length > 0) {
      try {
        await db.table(key).bulkPut(rows)
      } catch (e) {
        // Table may not exist in this schema version; skip
        continue
      }
    }
    counts[key] = rows.length
  }
  return { counts }
}
