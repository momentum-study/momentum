import { useMemo, useState } from 'react'
import { format, subDays } from 'date-fns'
import { v4 as uuid } from 'uuid'
import { PomodoroTimer } from '../../components/widgets/PomodoroTimer'
import QuickTimer from '../../components/widgets/QuickTimer'
import { useData } from '../../app/providers'
import { useUndo } from '../../lib/use-undo'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader, CardTitle } from '../../components/ui/Card'
import { PageSpinner } from '../../components/ui/Spinner'
import { Modal } from '../../components/ui/Modal'
import { cn, formatMinutes, getSessionScope, isoNow } from '../../lib/utils'
import { loadSettings } from '../settings/SettingsPage'
import { db } from '../../db/app-db'
import { updateRoutineLogsForSession, revertRoutineLogsForSession } from '../../lib/routine-tracker'
import { useSessionSync } from '../../lib/use-session-sync'
import type { Session, DayOfWeek, RoutineLog } from '../../domain/types'
import { Link } from 'react-router-dom'
import { useDashboardWidgets, DASHBOARD_WIDGETS } from '../../lib/use-dashboard-widgets'

export default function Dashboard() {
  const { data, isLoading, loadData } = useData()
  const { syncSession } = useSessionSync()
  const { push } = useUndo()
  const { visibleWidgets, setVisibleWidgets } = useDashboardWidgets()
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const todayStr = format(new Date(), 'yyyy-MM-dd')

  const academicSessions = useMemo(
    () => data.sessions.filter((s) => getSessionScope(s, data.subjects, data.categories) === 'academic'),
    [data.sessions, data.subjects, data.categories]
  )

  const streak = useMemo(() => {
    const daySet = new Set<string>()
    for (const s of academicSessions) {
      daySet.add(format(new Date(s.startAt), 'yyyy-MM-dd'))
    }
    let count = 0
    let missed = 0
    let d = new Date()
    while (true) {
      const ds = format(d, 'yyyy-MM-dd')
      if (daySet.has(ds)) {
        count++
        missed = 0
        d = subDays(d, 1)
      } else {
        missed++
        if (missed > 1) break
        d = subDays(d, 1)
      }
    }
    return count
  }, [academicSessions])

  const [calendarMonth, setCalendarMonth] = useState(new Date())
  const minutesByDay = useMemo(() => {
    const map: Record<string, number> = {}
    for (const s of academicSessions) {
      const day = format(new Date(s.startAt), 'yyyy-MM-dd')
      map[day] = (map[day] ?? 0) + s.durationMinutes
    }
    return map
  }, [academicSessions])
  const calendarDays = useMemo(() => {
    const start = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1)
    const daysInMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate()
    const pad = start.getDay()
    return { daysInMonth, pad }
  }, [calendarMonth])
  const heatMax = useMemo(() => {
    const prefix = format(calendarMonth, 'yyyy-MM-')
    const vals = Object.entries(minutesByDay).filter(([k]) => k.startsWith(prefix)).map(([, v]) => v)
    return Math.max(1, ...vals)
  }, [minutesByDay, calendarMonth])

  const [logSubjectId, setLogSubjectId] = useState('')
  const [logProjectId, setLogProjectId] = useState('')
  const [logTaskId, setLogTaskId] = useState('')
  const [logDuration, setLogDuration] = useState(30)
  const [logDate, setLogDate] = useState(todayStr)
  const [logNote, setLogNote] = useState('')

  async function handleLogTime() {
    const project = logProjectId ? data.projects.find((p) => p.id === logProjectId) : undefined
    const task = logTaskId ? data.assignments.find((a) => a.id === logTaskId) : undefined
    const actualSubjectId = project ? project.subjectId : logSubjectId
    if (!actualSubjectId) return
    const note = logNote.trim() || (task ? `Task: ${task.title}` : undefined)
    const session = {
      id: uuid(),
      subjectId: actualSubjectId,
      projectId: project?.id ?? null,
      assignmentId: task?.id ?? null,
      startAt: new Date(`${logDate}T00:00:00`).toISOString(),
      endAt: new Date(new Date(`${logDate}T00:00:00`).getTime() + logDuration * 60_000).toISOString(),
      durationMinutes: logDuration,
      note: note || undefined,
      source: 'quickLog' as const,
      createdAt: isoNow(),
      updatedAt: isoNow(),
    }
    await db.sessions.add(session)
    const subjectName = data.subjects.find((s) => s.id === actualSubjectId)?.name ?? 'Unknown Subject'
    await updateRoutineLogsForSession(session)
    syncSession(session, subjectName)
    await loadData()
    let description = `Logged ${logDuration}m${project ? ` for ${project.name}` : ` study for ${subjectName}`}`
    if (task) description += ` (${task.title})`
    push({
      description,
      undo: async () => { await db.sessions.delete(session.id); await loadData() },
      redo: async () => { await db.sessions.add(session); await loadData() },
    })
    setLogSubjectId('')
    setLogProjectId('')
    setLogTaskId('')
    setLogNote('')
  }

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
    await revertRoutineLogsForSession(session)
    await loadData()
    push({
      description: `Deleted session (${session.durationMinutes}m)`,
      undo: async () => { await db.sessions.add(session); await updateRoutineLogsForSession(session); await loadData() },
      redo: async () => { await db.sessions.delete(id); await revertRoutineLogsForSession(session); await loadData() },
    })
  }

  if (isLoading) return <PageSpinner />
  const settings = loadSettings()
  const todayMinutes = academicSessions
    .filter((s) => format(new Date(s.startAt), 'yyyy-MM-dd') === todayStr)
    .reduce((sum, s) => sum + s.durationMinutes, 0)
  const weekStart = new Date()
  weekStart.setDate(weekStart.getDate() - weekStart.getDay())
  weekStart.setHours(0, 0, 0, 0)
  const weekMinutes = academicSessions
    .filter((s) => new Date(s.startAt) >= weekStart)
    .reduce((sum, s) => sum + s.durationMinutes, 0)
  const goalPct = Math.min(100, Math.round((todayMinutes / settings.dailyTargetMinutes) * 100))
  const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
  const recentSessions = academicSessions.slice(0, 8).map((s) => ({
    ...s,
    subjectName: data.subjects.find((sub) => sub.id === s.subjectId)?.name ?? 'Unknown',
  }))

  const isWidgetVisible = (id: string) => visibleWidgets.includes(id)
  const toggleWidget = (id: string) => {
    if (visibleWidgets.includes(id)) {
      setVisibleWidgets(visibleWidgets.filter((w) => w !== id))
    } else {
      setVisibleWidgets([...visibleWidgets, id])
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Dashboard</h2>
        <Button variant="secondary" size="sm" onClick={() => setCustomizeOpen(true)}>Customise</Button>
      </div>

      <Modal open={customizeOpen} onClose={() => setCustomizeOpen(false)} title="Customise Dashboard">
        <div className="space-y-2">
          {DASHBOARD_WIDGETS.map((w) => (
            <div key={w.id} className="flex items-center justify-between">
              <span className="text-sm">{w.label}</span>
              <input type="checkbox" checked={visibleWidgets.includes(w.id)} onChange={() => toggleWidget(w.id)} />
            </div>
          ))}
        </div>
        <Button className="mt-4 w-full" onClick={() => setCustomizeOpen(false)}>Done</Button>
      </Modal>

      {isWidgetVisible('stats') && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <div className="text-sm text-slate-500 dark:text-slate-400">Today</div>
            <div className="mt-1 text-2xl font-semibold text-slate-800 dark:text-slate-100">{formatMinutes(todayMinutes)}</div>
          </Card>
          <Card>
            <div className="text-sm text-slate-500 dark:text-slate-400">This Week</div>
            <div className="mt-1 text-2xl font-semibold text-slate-800 dark:text-slate-100">{formatMinutes(weekMinutes)}</div>
          </Card>
        </div>
      )}

      {isWidgetVisible('today') && (
        <Card>
          <CardHeader><CardTitle>Today</CardTitle></CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-8">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Routines</span>
                <Link to="/routines" className="text-xs text-primary-600 hover:underline">Manage</Link>
              </div>
              {(() => {
                const todayDow = new Date().getDay() as DayOfWeek
                const todaysRoutines = data.routines.filter((r) => !r.deletedAt && r.days.includes(todayDow))
                if (todaysRoutines.length === 0) return <p className="text-sm text-slate-500">No routines scheduled</p>
                const logMap: Record<string, RoutineLog> = {}
                data.routineLogs.forEach((l) => { if (l.date === todayStr) logMap[l.routineId] = l })
                const scheduled = todaysRoutines.reduce((s, r) => s + r.targetMinutes, 0)
                const completed = todaysRoutines.reduce((s, r) => {
                  const log = logMap[r.id]
                  return s + (log ? Math.min(log.actualMinutes, r.targetMinutes) : 0)
                }, 0)
                const pct = scheduled > 0 ? Math.round((completed / scheduled) * 100) : 0
                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-700 dark:text-slate-300">{completed} / {scheduled}m</span>
                      <span className="font-medium text-primary-600">{pct}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700">
                      <div className="h-2 rounded-full bg-primary-500" style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                  </div>
                )
              })()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Tasks Due</span>
                <Link to="/calendar" className="text-xs text-primary-600 hover:underline">View</Link>
              </div>
              {(() => {
                const due = data.assignments
                  .filter((a) => !a.deletedAt && !a.completed && a.dueDate !== '' && a.dueDate <= todayStr)
                  .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
                  .slice(0, 5)
                if (due.length === 0) return <p className="text-sm text-slate-500">No tasks due today</p>
                return (
                  <ul className="space-y-1">
                    {due.map((a) => (
                      <li key={a.id} className="flex items-center justify-between text-sm">
                        <span className="truncate text-slate-700 dark:text-slate-300">{a.title}</span>
                        <span className={cn(
                          'ml-2 shrink-0 text-xs',
                          a.dueDate < todayStr ? 'text-red-500' : 'text-slate-400'
                        )}>
                          {a.dueDate === todayStr ? 'Today' : a.dueDate ? `Overdue ${format(new Date(a.dueDate), 'd MMM')}` : 'No date'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )
              })()}
            </div>
          </div>
        </Card>
      )}

      {isWidgetVisible('streak-goal') && (
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
                    <div className={cn('h-6 w-6 rounded-full text-xs flex items-center justify-center font-medium', hasStudy ? 'bg-orange-500 text-orange-50' : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500', ds === todayStr && 'ring-2 ring-orange-400')}>{label}</div>
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
      )}

      {isWidgetVisible('pomodoro') && <PomodoroTimer />}
      {isWidgetVisible('quick-timer') && <QuickTimer />}

      {isWidgetVisible('log-time') && (
        <Card>
          <CardHeader><CardTitle>Log Study Time</CardTitle></CardHeader>
          <div className="mt-2 space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="label">Subject</label>
                <select className="input" value={logSubjectId} onChange={(e) => { setLogSubjectId(e.target.value); setLogProjectId(''); setLogTaskId('') }}>
                  <option value="">Select subject</option>
                  {data.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              {logSubjectId && (
                <div>
                  <label className="label">Project (optional)</label>
                  <select className="input" value={logProjectId} onChange={(e) => { const pid = e.target.value; setLogProjectId(pid); setLogTaskId(''); if (pid) { const proj = data.projects.find((p) => p.id === pid); if (proj) setLogSubjectId(proj.subjectId) } }}>
                    <option value="">— Select project —</option>
                    {data.projects.filter((p) => p.subjectId === logSubjectId).map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {logProjectId && (
                <div>
                  <label className="label">Task (optional)</label>
                  <select className="input" value={logTaskId} onChange={(e) => setLogTaskId(e.target.value)}>
                    <option value="">— Select task —</option>
                    {data.assignments.filter((a) => a.projectId === logProjectId && !a.completed && !a.deletedAt).map((a) => (
                      <option key={a.id} value={a.id}>{a.title}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="label">Minutes</label>
                <input type="number" className="input w-24" min={1} value={logDuration} onChange={(e) => setLogDuration(Number(e.target.value))} />
              </div>
              <div>
                <label className="label">Date</label>
                <input type="date" className="input" max={todayStr} value={logDate} onChange={(e) => setLogDate(e.target.value)} />
              </div>
              <div className="flex-1">
                <label className="label">Note (optional)</label>
                <input className="input w-full" placeholder="What did you work on?" value={logNote} onChange={(e) => setLogNote(e.target.value)} />
              </div>
              <Button disabled={!logSubjectId && !logProjectId} onClick={handleLogTime}>Log Time</Button>
            </div>
          </div>
        </Card>
      )}

      {isWidgetVisible('calendar') && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Study Calendar</CardTitle>
              <div className="flex items-center gap-2">
                <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700">←</button>
                <span className="text-sm font-medium">{format(calendarMonth, 'MMMM yyyy')}</span>
                <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700">→</button>
              </div>
            </div>
          </CardHeader>
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="py-1 font-medium text-slate-500">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: calendarDays.pad }).map((_, i) => <div key={`pad-${i}`} />)}
            {Array.from({ length: calendarDays.daysInMonth }, (_, i) => {
              const dayNum = i + 1
              const dateStr = `${format(calendarMonth, 'yyyy-MM')}-${String(dayNum).padStart(2, '0')}`
              const mins = minutesByDay[dateStr] ?? 0
              const intensity = mins / heatMax
              const isToday = dateStr === todayStr
              return (
                <div
                  key={dayNum}
                  title={`${dateStr}: ${formatMinutes(mins)}`}
                  className={cn(
                    'flex h-9 flex-col items-center justify-center rounded text-xs transition-all',
                    isToday && 'ring-2 ring-primary-500',
                    mins === 0 && 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
                    mins > 0 && 'text-white font-medium',
                  )}
                  style={mins > 0 ? { backgroundColor: `rgba(34, 197, 94, ${0.3 + intensity * 0.7})` } : undefined}
                >
                  <span>{dayNum}</span>
                  {mins > 0 && <span className="text-[10px] opacity-80">{formatMinutes(mins)}</span>}
                </div>
              )
            })}
          </div>
          <div className="mt-2 flex items-center justify-end gap-1 text-xs text-slate-500">
            <span>No study</span>
            <div className="h-3 w-3 rounded-sm bg-slate-100 dark:bg-slate-800" />
            <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: 'rgba(34, 197, 94, 0.3)' }} />
            <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: 'rgba(34, 197, 94, 0.65)' }} />
            <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: 'rgba(34, 197, 94, 1)' }} />
            <span>Full</span>
          </div>
        </Card>
      )}

      {isWidgetVisible('recent') && (
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
      )}

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
