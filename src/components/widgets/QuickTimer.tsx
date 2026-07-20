import { useEffect, useRef, useState } from 'react'
import { v4 as uuid } from 'uuid'
import { db } from '../../db/app-db'
import { Button } from '../ui/Button'
import { Card, CardHeader, CardTitle } from '../ui/Card'
import { useData } from '../../app/providers'
import { useSessionSync } from '../../lib/use-session-sync'
import { updateRoutineLogsForSession, updateStreakDayForSession } from '../../lib/routine-tracker'
import type { Session } from '../../domain/types'
import { cn, isoNow } from '../../lib/utils'

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
  const startedAtRef = useRef<number | null>(loadPersisted().startedAt)
  const [focusTag, setFocusTag] = useState<Session['focusTag'] | null>(null)

  const [selectedSubjectId, setSelectedSubjectId] = useState(() => localStorage.getItem('momentum-quick-timer-subject') ?? '')

  useEffect(() => {
    if (running && startedAtRef.current) {
      const tick = () => {
        const elapsed = Math.floor((Date.now() - startedAtRef.current!) / 1000)
        setSeconds(elapsed)
      }
      tick()
      intervalRef.current = window.setInterval(tick, 1000)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [running])

  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden && running && startedAtRef.current) {
        const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000)
        setSeconds(elapsed)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [running])

  function start() {
    startedAtRef.current = Date.now()
    setRunning(true)
    setFocusTag(null)
  }
  // Persist whenever any timer state changes
  useEffect(() => {
    savePersisted({ running, seconds, label, startedAt: startedAtRef.current })
  }, [running, seconds, label])

  async function stop() {
    startedAtRef.current = null
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = null
    setRunning(false)

    const total = seconds
    if (total < 10) return

    const subject = data.subjects.find(s => s.id === selectedSubjectId)
    if (!subject) {
      window.alert('Please select a subject before saving.')
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
      durationSeconds: Math.max(10, Math.round(total)),
      note: label || undefined,
      source: 'timer' as const,
      createdAt: isoNow(),
      updatedAt: isoNow(),
      ...(focusTag ? { focusTag } : {}),
    }
    await db.sessions.add(session)
    syncSession(session, subject.name)
    await updateRoutineLogsForSession(session)
    await updateStreakDayForSession(session)
    await loadData()
    setFocusTag(null)
  }

  function reset() {
    startedAtRef.current = null
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = null
    setRunning(false)
    setSeconds(0)
    setLabel('')
    setFocusTag(null)
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
        <select
          className="input w-full"
          value={selectedSubjectId}
          onChange={(e) => { setSelectedSubjectId(e.target.value); localStorage.setItem('momentum-quick-timer-subject', e.target.value) }}
          disabled={running}
        >
          <option value="">Select subject</option>
          {data.subjects.filter(s => !s.deletedAt).map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
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
        {/* Focus tag selector */}
        <div className="flex gap-1 flex-wrap" role="group" aria-label="Focus tag">
          {(['focused', 'distracted', 'group', 'revision'] as const).map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setFocusTag(focusTag === tag ? null : tag)}
              className={cn(
                'rounded-full px-2 py-0.5 text-xs border',
                focusTag === tag
                  ? 'border-primary-500 bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-200'
                  : 'border-slate-300 text-slate-500 dark:border-slate-600 dark:text-slate-400'
              )}
            >
              {tag}
            </button>
          ))}
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
