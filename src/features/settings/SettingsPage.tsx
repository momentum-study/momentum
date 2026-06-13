import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Card, CardHeader, CardTitle } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { useData } from '../../app/providers'
import { useAuth } from '../../app/auth-provider'
import { downloadBackup, readBackupFile, importBackup, ImportMode } from '../../lib/backup'

const STORAGE_KEY = 'momentum-settings'

export type Settings = {
  darkMode: boolean
  pomodoroEnabled: boolean
  pomodoroFocusMinutes: number
  pomodoroBreakMinutes: number
  pomodoroLongBreakMinutes: number
  pomodoroCyclesBeforeLongBreak: number
  dailyTargetMinutes: number
  soundEnabled: boolean
  maxActiveHabits: number
  defaultArchiveDays: number
}

export const DEFAULT_SETTINGS: Settings = {
  darkMode: true,
  pomodoroEnabled: true,
  pomodoroFocusMinutes: 25,
  pomodoroBreakMinutes: 5,
  pomodoroLongBreakMinutes: 15,
  pomodoroCyclesBeforeLongBreak: 4,
  dailyTargetMinutes: 120,
  soundEnabled: true,
  maxActiveHabits: 3,
  defaultArchiveDays: 66,
}


export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch (e) { /* ignore */ }
  return { ...DEFAULT_SETTINGS }
}

export function saveSettings(settings: Settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

export function applyDarkMode(enabled: boolean) {
  if (enabled) {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
        value ? 'bg-primary-600' : 'bg-slate-300 dark:bg-slate-600'
      }`}
      role="switch"
      aria-checked={value}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
          value ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

function SettingsField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3 pl-4 pr-4">
      <span className="label">{label}</span>
      <div>{children}</div>
    </div>
  )
}

function NumberInput({ value, onChange, min = 0 }: { value: number; onChange: (n: number) => void; min?: number }) {
  return (
    <input
      type="number"
      min={min}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="input w-24 text-right"
    />
  )
}

// ── Data Import ────────────────────────────────────────────────────────────────

function DataImport() {
  const { loadData } = useData()
  const fileRef = useRef<HTMLInputElement>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [pendingPayload, setPendingPayload] = useState<Awaited<ReturnType<typeof readBackupFile>> | null>(null)
  const [preview, setPreview] = useState<{ total: number; tables: string[] } | null>(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [mode, setMode] = useState<ImportMode>('merge')

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setSuccess('')
    try {
      const payload = await readBackupFile(file)
      const tables = Object.entries(payload.data)
        .filter(([, rows]) => Array.isArray(rows) && (rows as unknown[]).length > 0)
        .map(([key, rows]) => `${key}: ${(rows as unknown[]).length}`)
      setPendingPayload(payload)
      setPreview({ total: tables.length, tables })
      setModalOpen(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read file')
    }
    // reset so same file can be re-selected
    e.target.value = ''
  }

  const doImport = async () => {
    if (!pendingPayload) return
    setImporting(true)
    setError('')
    try {
      const { counts } = await importBackup(pendingPayload, mode)
      const imported = Object.values(counts).reduce((a, b) => a + b, 0)
      setSuccess(`Imported ${imported} records across ${Object.keys(counts).length} tables.`)
      setPreview(null)
      setPendingPayload(null)
      setModalOpen(false)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  const closeModal = () => {
    setModalOpen(false)
    setPreview(null)
    setPendingPayload(null)
    setError('')
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleFileChange}
      />
      <Button
        variant="secondary"
        size="sm"
        onClick={() => fileRef.current?.click()}
      >
        Import Data (JSON)
      </Button>

      <Modal open={modalOpen} onClose={closeModal} title="Import Backup">
        {preview && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Found <strong>{preview.total} table{preview.total !== 1 ? 's' : ''}</strong> with data:
            </p>
            <ul className="max-h-48 overflow-y-auto rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              {preview.tables.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>

            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Import mode</p>
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <input type="radio" name="importMode" value="merge" checked={mode === 'merge'} onChange={() => setMode('merge')} />
                <span><strong>Merge</strong> — update existing records by id, keep everything else</span>
              </label>
              <label className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                <input type="radio" name="importMode" value="replace" checked={mode === 'replace'} onChange={() => setMode('replace')} />
                <span><strong>Replace</strong> — clear all tables first, then import (destructive)</span>
              </label>
            </div>

            {mode === 'replace' && (
              <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
                ⚠️ Replace mode will permanently delete ALL existing data before importing.
              </div>
            )}

            {error && (
              <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">{error}</div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={closeModal}>Cancel</Button>
              <Button variant="primary" onClick={doImport} disabled={importing}>
                {importing ? 'Importing...' : 'Import'}
              </Button>
            </div>
          </div>
        )}

        {!preview && error && (
          <div className="space-y-4">
            <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">{error}</div>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setError('')}>OK</Button>
            </div>
          </div>
        )}
      </Modal>

      {success && (
        <div className="mt-2 rounded bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-300">{success}</div>
      )}
    </>
  )
}

// ── Settings Page ──────────────────────────────────────────────────────────────

function AccountSettings() {
  const { user, profile, signIn, signOut } = useAuth()
  return (
    <Card>
      <CardHeader>
        <CardTitle>Account & Cloud</CardTitle>
      </CardHeader>
      {user ? (
        <div className="space-y-3">
          <div className="text-sm">
            Signed in as <strong>{profile?.displayName ?? user.email}</strong>
          </div>
          <Button variant="danger" onClick={signOut}>Sign Out</Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">Sign in to sync your study data and join groups.</p>
          <Button variant="primary" onClick={signIn}>Sign In with Google</Button>
        </div>
      )}
    </Card>
  )
}


export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    saveSettings(settings)
    applyDarkMode(settings.darkMode)
  }, [settings])

  useEffect(() => {
    if (saved) {
      const t = setTimeout(() => setSaved(false), 2000)
      return () => clearTimeout(t)
    }
  }, [saved])

  const update = (patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }))
    setSaved(true)
  }

  return (
    <div className="space-y-6">
      {saved && (
        <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-300">
          Settings saved
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <SettingsField label="Dark Mode">
          <Toggle value={settings.darkMode} onChange={(v) => update({ darkMode: v })} />
        </SettingsField>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pomodoro Timer</CardTitle>
        </CardHeader>
        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          <SettingsField label="Show Pomodoro mode">
            <Toggle value={settings.pomodoroEnabled} onChange={(v) => update({ pomodoroEnabled: v })} />
          </SettingsField>
          <SettingsField label="Focus minutes">
            <NumberInput value={settings.pomodoroFocusMinutes} onChange={(v) => update({ pomodoroFocusMinutes: v })} min={1} />
          </SettingsField>
          <SettingsField label="Short break minutes">
            <NumberInput value={settings.pomodoroBreakMinutes} onChange={(v) => update({ pomodoroBreakMinutes: v })} min={1} />
          </SettingsField>
          <SettingsField label="Long break minutes">
            <NumberInput value={settings.pomodoroLongBreakMinutes} onChange={(v) => update({ pomodoroLongBreakMinutes: v })} min={1} />
          </SettingsField>
          <SettingsField label="Cycles before long break">
            <NumberInput value={settings.pomodoroCyclesBeforeLongBreak} onChange={(v) => update({ pomodoroCyclesBeforeLongBreak: v })} min={1} />
          </SettingsField>
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          When disabled, only the simple count-up timer is shown on the Dashboard.
        </p>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daily Target</CardTitle>
        </CardHeader>
        <SettingsField label="Daily study goal (minutes)">
          <NumberInput value={settings.dailyTargetMinutes} onChange={(v) => update({ dailyTargetMinutes: v })} />
        </SettingsField>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
        </CardHeader>
        <SettingsField label="Play sound on timer end">
          <Toggle value={settings.soundEnabled} onChange={(v) => update({ soundEnabled: v })} />
        </SettingsField>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Habits</CardTitle>
        </CardHeader>
        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          <SettingsField label="Habit limit">
            <NumberInput value={settings.maxActiveHabits} onChange={(v) => update({ maxActiveHabits: v })} min={1} />
          </SettingsField>
          <SettingsField label="Suggestion threshold (days)">
            <NumberInput value={settings.defaultArchiveDays} onChange={(v) => update({ defaultArchiveDays: v })} min={1} />
          </SettingsField>
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Research suggests 1–3 habits is optimal for building consistency. The threshold shows a gentle suggestion to archive once a habit feels automatic.
        </p>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data Management</CardTitle>
        </CardHeader>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Export your data as a JSON file to back it up, or import a previously exported backup.
          Exports include all marks, focus areas, sessions, habits, and other study data.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={async () => { await downloadBackup() }}>
            Export Data (JSON)
          </Button>
          <DataImport />
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reset</CardTitle>
        </CardHeader>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Reset all settings to defaults. Your study data is not affected.
        </p>
        <div className="mt-3">
          <Button variant="secondary" size="sm" onClick={() => {
            if (confirm('Reset all settings to defaults?')) {
              localStorage.removeItem(STORAGE_KEY)
              window.location.reload()
            }
          }}>
            Reset Settings
          </Button>
        </div>
      </Card>

      <AccountSettings />
    </div>
  )
}
