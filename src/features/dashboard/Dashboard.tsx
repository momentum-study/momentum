import { useMemo, useState } from 'react'
import { format, subDays } from 'date-fns'
import { v4 as uuid } from 'uuid'
import { PomodoroTimer } from '../../components/widgets/PomodoroTimer'
import { useData } from '../../app/providers'
import { useUndo } from '../../lib/use-undo'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader, CardTitle } from '../../components/ui/Card'
import { PageSpinner } from '../../components/ui/Spinner'
import { Modal } from '../../components/ui/Modal'
import { cn, formatMinutes, isoNow } from '../../lib/utils'
import { loadSettings } from '../settings/SettingsPage'
import { db } from '../../db/app-db'
import { useSessionSync } from '../../lib/use-session-sync'
import type { Session } from '../../domain/types'

export default function Dashboard() {
  const { data, isLoading, loadData } = useData()
  const { syncSession } = useSessionSync()
  const { push } = useUndo()
  const todayStr = format(new Date(), 'yyyy-MM-dd')

  // Streak: only count timer/pomodoro sessions + manual sessions logged today
  const streak = useMemo(() => {
    const daySet = new Set<string>()
    for (const s of data.sessions) {
      const day = format(new Date(s.startAt), 'yyyy-MM-dd')
      // Timer/pomodoro sessions always count.
      // Manual sessions only count if logged for today (same-day entry).
      if (s.source === 'timer' || s.source === 'pomodoro' || day === todayStr) {
        daySet.add(day)
      }
    }
    let count = 0
    let d = new Date()
    while (true) {
      const ds = format(d, 'yyyy-MM-dd')
      if (daySet.has(ds)) {
        count++
        d = subDays(d, 1)
      } else { break }
    }
    return count
  }, [data.sessions, todayStr])

  // Heatmap: last 90 days of study time
  const heatmap = useMemo(() => {
    const dayMinutes: Record<string, number> = {}
    for (const s of data.sessions) {
      const day = format(new Date(s.startAt), 'yyyy-MM-dd')
      dayMinutes[day] = (dayMinutes[day] ?? 0) + s.durationMinutes
    }
    return Array.from({ length: 90 }, (_, i) => {
      const d = subDays(new Date(), 89 - i)
      const ds = format(d, 'yyyy-MM-dd')
      return { date: ds, minutes: dayMinutes[ds] ?? 0 }
    })
  }, [data.sessions])

  // Log Study Time form state
  const [logSubjectId, setLogSubjectId] = useState('')
  const [logDuration, setLogDuration] = useState(30)
  const [logDate, setLogDate] = useState(todayStr)
  async function handleLogTime() {
    if (!logSubjectId) return
    const session = {
      id: uuid(),
      subjectId: logSubjectId,
      startAt: new Date(`${logDate}T00:00:00`).toISOString(),
      endAt: new Date(new Date(`${logDate}T00:00:00`).getTime() + logDuration * 60_000).toISOString(),
      durationMinutes: logDuration,
      source: 'manual' as const,
      createdAt: isoNow(),
      updatedAt: isoNow(),
    }
    await db.sessions.add(session)
    const subjectName = data.subjects.find((s) => s.id === logSubjectId)?.name ?? 'Unknown Subject'
    syncSession(session, subjectName)
    await loadData()
    push({
      description: `Logged ${logDuration}m study for ${subjectName}`,
      undo: async () => { await db.sessions.delete(session.id); await loadData() },
      redo: async () => { await db.sessions.add(session); await loadData() },
    })
    setLogSubjectId('')
  }

  // Edit log state
  const [editLog, setEditLog] = useState<Session | null>(null)
  const [editDuration, setEditDuration] = useState(30)
  const [editDate, setEditDate] = useState(todayStr)

  async function saveEditLog() {
    if (!editLog) return
    const prevSession = { ...editLog }
    const dateAtMidnight = new Date(`${editDate}T00:00:00`)
    const endAt = new Date(dateAtMidnight.getTime() + editDuration * 60_000)
    const updated = {
      startAt: dateAtMidnight.toISOString(),
      endAt: endAt.toISOString(),
      durationMinutes: editDuration,
      updatedAt: isoNow(),
    }
    await db.sessions.update(editLog.id, updated)
    await loadData()
    setEditLog(null)
    push({
      description: `Edited session`,
      undo: async () => { await db.sessions.update(editLog.id, { startAt: prevSession.startAt, endAt: prevSession.endAt, durationMinutes: prevSession.durationMinutes, updatedAt: prevSession.updatedAt }); await loadData() },
      redo: async () => { await db.sessions.update(editLog.id, updated); await loadData() },
    })
  }

  async function deleteSession(id: string) {
    const session = data.sessions.find((s) => s.id === id)
    if (!session) return
    await db.sessions.delete(id)
    await loadData()
    push({
      description: `Deleted session (${session.durationMinutes}m)`,
      undo: async () => { await db.sessions.add(session); await loadData() },
      redo: async () => { await db.sessions.delete(id); await loadData() },
    })
  }

  if (isLoading) return <PageSpinner />

  const settings = loadSettings()

  const todayMinutes = data.sessions
    .filter((s) => s.startAt.startsWith(todayStr))
    .reduce((sum, s) => sum + s.durationMinutes, 0)

  const thisWeekStart = new Date()
  thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay())
  const weekStartStr = format(thisWeekStart, 'yyyy-MM-dd')
  const weekMinutes = data.sessions
    .filter((s) => s.startAt >= weekStartStr)
    .reduce((sum, s) => sum + s.durationMinutes, 0)

  const totalMinutes = data.sessions.reduce((sum, s) => sum + s.durationMinutes, 0)
  const goalPct = Math.min(100, Math.round((todayMinutes / settings.dailyTargetMinutes) * 100))
  const heatMax = Math.max(1, ...heatmap.map((d) => d.minutes))
  const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

  const recentSessions = data.sessions.slice(0, 8).map((s) => ({
    ...s,
    subjectName: data.subjects.find((sub) => sub.id === s.subjectId)?.name ?? 'Unknown',
  }))

  return (
    <div className="space-y-6">
      {/* Top stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><div className="text-sm text-slate-500">Today</div><div className="mt-1 text-2xl font-semibold text-slate-800">{formatMinutes(todayMinutes)}</div></Card>
        <Card><div className="text-sm text-slate-500">This Week</div><div className="mt-1 text-2xl font-semibold text-slate-800">{formatMinutes(weekMinutes)}</div></Card>
        <Card><div className="text-sm text-slate-500">Total</div><div className="mt-1 text-2xl font-semibold text-slate-800">{formatMinutes(totalMinutes)}</div></Card>
        <Card><div className="text-sm text-slate-500">Sessions</div><div className="mt-1 text-2xl font-semibold text-slate-800">{data.sessions.length}</div></Card>
      </div>

      {/* Streak & Daily Goal */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Study Streak</CardTitle></CardHeader>
          <div className="flex items-end gap-2">
            <span className="text-4xl font-bold text-orange-500">{streak}</span>
            <span className="text-sm text-slate-500">day{streak !== 1 ? 's' : ''}</span>
          </div>
          {streak === 0 && <p className="mt-2 text-sm text-slate-500">Log a session today to start your streak!</p>}
          <div className="mt-3 flex gap-2">
            {weekDays.map((label, i) => {
              const d = new Date(); d.setDate(d.getDate() - d.getDay() + i)
              const ds = format(d, 'yyyy-MM-dd')
              const hasStudy = data.sessions.some((s) => {
                const sd = format(new Date(s.startAt), 'yyyy-MM-dd')
                if (sd !== ds) return false
                return s.source === 'timer' || s.source === 'pomodoro' || sd === todayStr
              })
              return (
                <div key={i} className="flex flex-col items-center gap-1">
                  <div className={cn('h-6 w-6 rounded-full text-xs flex items-center justify-center font-medium', hasStudy ? 'bg-orange-400 text-white' : 'bg-slate-200 text-slate-400', ds === todayStr && 'ring-2 ring-orange-500')}>{label}</div>
                  {hasStudy && <span className="text-xs text-orange-500">*</span>}
                </div>
              )
            })}
          </div>
        </Card>

        <Card>
          <CardHeader><CardTitle>Daily Goal</CardTitle></CardHeader>
          <div className="flex items-end gap-2">
            <span className="text-4xl font-bold text-primary-600">{goalPct}%</span>
            <span className="text-sm text-slate-500">of {settings.dailyTargetMinutes}m</span>
          </div>
          <div className="mt-3 h-3 w-full rounded-full bg-slate-200"><div className={cn('h-3 rounded-full transition-all', goalPct >= 100 ? 'bg-green-500' : 'bg-primary-500')} style={{ width: `${goalPct}%` }} /></div>
          {goalPct >= 100 && <p className="mt-2 text-sm font-medium text-green-600">Goal reached!</p>}
          {goalPct < 100 && todayMinutes > 0 && <p className="mt-2 text-sm text-slate-500">{formatMinutes(settings.dailyTargetMinutes - todayMinutes)} to go</p>}
        </Card>
      </div>

      <PomodoroTimer />

      {/* Log Study Time */}
      <Card>
        <CardHeader><CardTitle>Log Study Time</CardTitle></CardHeader>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <div>
            <label className="label">Subject</label>
            <select className="input" value={logSubjectId} onChange={(e) => setLogSubjectId(e.target.value)}>
              <option value="">Select subject</option>
              {data.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Minutes</label>
            <input type="number" className="input w-24" min={1} value={logDuration} onChange={(e) => setLogDuration(Number(e.target.value))} />
          </div>
          <div>
            <label className="label">Date</label>
            <input type="date" className="input" max={todayStr} value={logDate} onChange={(e) => setLogDate(e.target.value)} />
          </div>
          <Button disabled={!logSubjectId} onClick={handleLogTime}>Log Time</Button>
        </div>
      </Card>

      {/* Study Heatmap */}
      <Card>
        <CardHeader><CardTitle>Study Heatmap — Last 90 Days</CardTitle></CardHeader>
        <div className="flex flex-wrap gap-1">
          {heatmap.map((d) => {
            const intensity = d.minutes / heatMax
            let bg = 'bg-slate-200'
            if (d.minutes > 0) {
              if (intensity > 0.75) bg = 'bg-green-600'
              else if (intensity > 0.5) bg = 'bg-green-500'
              else if (intensity > 0.25) bg = 'bg-green-400'
              else bg = 'bg-green-300'
            }
            return <div key={d.date} className={cn('h-3 w-3 rounded-sm', bg)} title={`${d.date}: ${formatMinutes(d.minutes)}`} />
          })}
        </div>
        <div className="mt-2 flex items-center gap-1 text-xs text-slate-500">
          <span>Less</span>
          <div className="h-3 w-3 rounded-sm bg-slate-200" />
          <div className="h-3 w-3 rounded-sm bg-green-300" />
          <div className="h-3 w-3 rounded-sm bg-green-400" />
          <div className="h-3 w-3 rounded-sm bg-green-500" />
          <div className="h-3 w-3 rounded-sm bg-green-600" />
          <span>More</span>
        </div>
      </Card>

      {/* Recent Sessions */}
      <Card>
        <CardHeader><CardTitle>Recent Sessions</CardTitle></CardHeader>
        {recentSessions.length === 0 ? (
          <p className="text-sm text-slate-500">No sessions yet. Start studying!</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {recentSessions.map((session) => (
              <li key={session.id} className="flex items-center justify-between py-2">
                <div>
                  <div className="text-sm font-medium text-slate-800">{session.subjectName}</div>
                  <div className="text-xs text-slate-500">{new Date(session.startAt).toLocaleDateString()} {session.source !== 'manual' && `(${session.source})`}</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-sm text-slate-600">{formatMinutes(session.durationMinutes)}</div>
                  <Button variant="secondary" size="sm" onClick={() => { setEditLog(session); setEditDuration(session.durationMinutes); setEditDate(format(new Date(session.startAt), 'yyyy-MM-dd')) }}>Edit</Button>
                  <Button variant="danger" size="sm" onClick={() => deleteSession(session.id)}>×</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Edit Session Modal */}
      <Modal open={editLog !== null} onClose={() => setEditLog(null)} title="Edit Session">
        <div className="space-y-3">
          <div>
            <label className="label">Minutes</label>
            <input type="number" className="input" min={1} value={editDuration} onChange={(e) => setEditDuration(Math.max(1, Number(e.target.value)))} />
          </div>
          <div>
            <label className="label">Date</label>
            <input type="date" className="input" max={todayStr} value={editDate} onChange={(e) => setEditDate(e.target.value)} />
          </div>
          <Button variant="primary" className="w-full" onClick={saveEditLog}>Save</Button>
        </div>
      </Modal>
    </div>
  )
}