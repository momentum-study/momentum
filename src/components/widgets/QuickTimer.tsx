import { useEffect, useRef, useState } from 'react'
import { v4 as uuid } from 'uuid'
import { db } from '../../db/app-db'
import { Button } from '../ui/Button'
import { Card, CardHeader, CardTitle } from '../ui/Card'
import { useData } from '../../app/providers'
import { useSessionSync } from '../../lib/use-session-sync'
import { updateRoutineLogsForSession, updateStreakDayForSession } from '../../lib/routine-tracker'
import { isoNow } from '../../lib/utils'

function fmt(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

const STORAGE_KEY = 'momentum-quick-timer'

interface PersistedTimer {
  running: boolean
  seconds: number
  label: string
  startedAt: number | null // ms epoch when the timer last started/resumed
}

function loadPersisted(): PersistedTimer {
  if (typeof localStorage === 'undefined') return { running: false, seconds: 0, label: '', startedAt: null }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { running: false, seconds: 0, label: '', startedAt: null }
    const parsed = JSON.parse(raw) as PersistedTimer
    // If the timer was running, add elapsed wall-clock time since it was started
    if (parsed.running && parsed.startedAt) {
      const elapsed = Math.floor((Date.now() - parsed.startedAt) / 1000)
      parsed.seconds += Math.max(0, elapsed)
      parsed.startedAt = Date.now() // reset anchor so subsequent ticks measure from now
    }
    return parsed
  } catch {
    return { running: false, seconds: 0, label: '', startedAt: null }
  }
}

function savePersisted(state: PersistedTimer) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch { /* ignore */ }
}

export default function QuickTimer() {
  const { data, loadData } = useData()
  const { syncSession } = useSessionSync()
  const [running, setRunning] = useState(() => loadPersisted().running)
  const [seconds, setSeconds] = useState(() => loadPersisted().seconds)
  const [label, setLabel] = useState(() => loadPersisted().label)
  const intervalRef = useRef<number | null>(null)

  useEffect(() => {
    if (running) {
      intervalRef.current = window.setInterval(() => {
        setSeconds((s) => s + 1)
      }, 1000)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [running])

  function start() {
    setRunning(true)
  }

  // Persist whenever any timer state changes
  useEffect(() => {
    savePersisted({ running, seconds, label, startedAt: running ? Date.now() : null })
  }, [running, seconds, label])

  async function stop() {
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = null
    setRunning(false)

    const total = seconds
    if (total < 10) return

    const subject = data.subjects[0]
    if (!subject) {
      // No subjects exist — notify the user instead of silently dropping the session
      window.alert('No subjects found. Please create a subject first so your session can be logged.')
      return
    }
    const now = new Date()
    const start = new Date(now.getTime() - total * 1000)
    const session = {
      id: uuid(),
      subjectId: subject.id,
      projectId: null,
      assignmentId: null,
      startAt: start.toISOString(),
      endAt: now.toISOString(),
      durationMinutes: Math.max(1, Math.round(total / 60)),
      note: label || undefined,
      source: 'timer' as const,
      createdAt: isoNow(),
      updatedAt: isoNow(),
    }
    await db.sessions.add(session)
    syncSession(session, subject.name)
    await updateRoutineLogsForSession(session)
    await updateStreakDayForSession(session)
    await loadData()
  }

  function reset() {
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = null
    setRunning(false)
    setSeconds(0)
    setLabel('')
  }

  const recentSessions = data.sessions
    .filter((s) => s.source === 'timer' && s.note)
    .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime())
    .slice(0, 5)

  return (
    <Card>
      <CardHeader>
        <CardTitle>⏱️ Quick Timer</CardTitle>
      </CardHeader>
      <div className="space-y-3">
        <input
          className="input w-full"
          placeholder="Optional label (e.g. Math Test)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          disabled={running}
        />
        <div className="text-center text-5xl font-bold tabular-nums text-slate-800 dark:text-slate-100">
          {fmt(seconds)}
        </div>
        <div className="flex justify-center gap-2">
          {!running ? (
            <Button variant="primary" onClick={start}>Start</Button>
          ) : (
            <Button variant="danger" onClick={stop}>Stop & Save</Button>
          )}
          <Button variant="secondary" onClick={reset}>Reset</Button>
        </div>
      </div>
      {recentSessions.length > 0 && (
        <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-700">
          <h4 className="text-sm font-medium text-slate-500 dark:text-slate-400">Recent</h4>
          <div className="mt-2 space-y-1">
            {recentSessions.map((s) => (
              <div key={s.id} className="flex justify-between text-xs text-slate-600 dark:text-slate-400">
                <span>{s.note}</span>
                <span>{s.durationMinutes}m</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}
