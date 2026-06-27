import { TodaysRoutinesList } from '../../components/widgets/TodaysRoutinesList'
import { SubjectBreakdown } from '../../components/widgets/SubjectBreakdown'
import { formatTotalToday, getLiveTimerSeconds, getLiveTimerSubjectId, getTotalTodayMinutes, isTimerActive } from '../../lib/timer-utils'
import { useEffect, useMemo, useState } from 'react'
import { format, subDays, differenceInCalendarDays } from 'date-fns'
import { v4 as uuid } from 'uuid'
import { PomodoroTimer } from '../../components/widgets/PomodoroTimer'
import QuickTimer from '../../components/widgets/QuickTimer'
import { useData } from '../../app/providers'
import { useUndo } from '../../lib/use-undo'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader, CardTitle } from '../../components/ui/Card'
import { Collapsible } from '../../components/ui/Collapsible'
import { PageSpinner } from '../../components/ui/Spinner'
import { Modal } from '../../components/ui/Modal'
import { cn, formatMinutes, getSessionScope, isoNow } from '../../lib/utils'
import { loadSettings } from '../settings/SettingsPage'
import { db } from '../../db/app-db'
import { updateRoutineLogsForSession, revertRoutineLogsForSession, updateStreakDayForSession, revertStreakDayForSession } from '../../lib/routine-tracker'
import { getDueCount } from '../../lib/fsrs-scheduler'
import { useSessionSync } from '../../lib/use-session-sync'
import type { Session, DayOfWeek, RoutineLog, HobbySession } from '../../domain/types'
import { Link } from 'react-router-dom'
import { useDashboardWidgets, DASHBOARD_WIDGETS } from '../../lib/use-dashboard-widgets'

const STREAK_MILESTONES = [7, 14, 21, 30, 66, 100] as const
const BEST_STREAK_KEY = 'momentum-best-streak'

export default function Dashboard() {
  const { data, isLoading, loadData } = useData()
  const { syncSession, syncSessionDelete } = useSessionSync()
  const { push } = useUndo()
  const { visibleWidgets, setVisibleWidgets } = useDashboardWidgets()
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const [logModalOpen, setLogModalOpen] = useState(false)
  const [showAllRecent, setShowAllRecent] = useState(false)
  const [menuSessionId, setMenuSessionId] = useState<string | null>(null)

  const todayStr = format(new Date(), 'yyyy-MM-dd')
  // Exclude soft-deleted sessions from streak / stats calculations.
  const academicSessions = useMemo(
    () => data.sessions.filter((s) => !s.deletedAt && getSessionScope(s, data.subjects, data.categories) === 'academic'),
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
  // Longest streak: compute from sessions, persist to localStorage
  const longestStreak = useMemo(() => {
    if (academicSessions.length === 0) return 0
    const daySet = new Set<string>()
    for (const s of academicSessions) {
      daySet.add(format(new Date(s.startAt), 'yyyy-MM-dd'))
    }
    const sortedDays = Array.from(daySet).sort()
    let max = 0
    let cur = 1
    for (let i = 1; i < sortedDays.length; i++) {
      const diff = differenceInCalendarDays(new Date(sortedDays[i]), new Date(sortedDays[i - 1]))
      if (diff === 1) { cur++; if (cur > max) max = cur } else { cur = 1 }
    }
    // Also consider any previously stored best streak
    try {
      const stored = Number(localStorage.getItem(BEST_STREAK_KEY))
      if (stored > max) max = stored
    } catch {}
    return max
  }, [academicSessions])
  useEffect(() => {
    try {
      localStorage.setItem(BEST_STREAK_KEY, String(longestStreak))
    } catch {}
  }, [longestStreak])


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

  const LOG_FORM_KEY = 'dash-log-form'
  const persistedForm = (() => {
    try { return JSON.parse(sessionStorage.getItem(LOG_FORM_KEY) ?? 'null') } catch { return null }
  })()

  const [logSubjectId, setLogSubjectId] = useState(persistedForm?.subjectId ?? '')
  const [logProjectId, setLogProjectId] = useState(persistedForm?.projectId ?? '')
  const [logTaskId, setLogTaskId] = useState(persistedForm?.taskId ?? '')
  const [logDuration, setLogDuration] = useState(persistedForm?.duration ?? 30)
  const [logDate, setLogDate] = useState(persistedForm?.date ?? todayStr)
  const [logNote, setLogNote] = useState(persistedForm?.note ?? '')
  const [logHobbyMode, setLogHobbyMode] = useState(persistedForm?.hobbyMode ?? false)
  const [logHobbyId, setLogHobbyId] = useState(persistedForm?.hobbyId ?? '')

  useEffect(() => {
    sessionStorage.setItem(LOG_FORM_KEY, JSON.stringify({
      subjectId: logSubjectId, projectId: logProjectId, taskId: logTaskId,
      duration: logDuration, date: logDate, note: logNote,
      hobbyMode: logHobbyMode, hobbyId: logHobbyId,
    }))
  }, [logSubjectId, logProjectId, logTaskId, logDuration, logDate, logNote, logHobbyMode, logHobbyId])

  async function handleLogTime() {
    const note = logNote.trim()
    const now = new Date()
    const [y, m, d] = logDate.split('-').map(Number)
    now.setFullYear(y, m - 1, d)
    const startAt = now.toISOString()
    const endAt = new Date(now.getTime() + logDuration * 60_000).toISOString()

    if (logHobbyMode && logHobbyId) {
      const hobbySession: HobbySession = {
        id: uuid(),
        hobbyId: logHobbyId,
        durationMinutes: logDuration,
        startAt,
        endAt,
        note,
        createdAt: isoNow(),
        updatedAt: isoNow(),
      }
      await db.hobbySessions.add(hobbySession)
      // auto-increase skill: +1 per 10h
      const hobby = data.hobbies.find(h => h.id === logHobbyId)
      const existingMinutes = data.hobbySessions.filter(s => s.hobbyId === logHobbyId).reduce((a, s) => a + s.durationMinutes, 0)
      const totalMinutes = existingMinutes + logDuration
      const newSkillLevel = Math.min(100, Math.floor(totalMinutes / 600))
      await db.hobbies.update(logHobbyId, { skillLevel: newSkillLevel, updatedAt: isoNow() })
      await loadData()
      const hobbyName = hobby?.name ?? 'Hobby'
      push({
        description: `Logged ${logDuration}m for ${hobbyName}`,
        undo: async () => { await db.hobbySessions.delete(hobbySession.id); await loadData() },
        redo: async () => { await db.hobbySessions.add(hobbySession); await loadData() },
      })
    } else {
      const project = logProjectId ? data.projects.find((p) => p.id === logProjectId) : undefined
      const task = logTaskId ? data.assignments.find((a) => a.id === logTaskId) : undefined
      const actualSubjectId = project ? project.subjectId : logSubjectId
      if (!actualSubjectId) return
      const taskNote = note || (task ? `Task: ${task.title}` : undefined)
      const session = {
        id: uuid(),
        subjectId: actualSubjectId,
        projectId: project?.id ?? null,
        assignmentId: task?.id ?? null,
        startAt,
        endAt,
        durationMinutes: logDuration,
        note: taskNote,
        source: 'quickLog' as const,
        createdAt: isoNow(),
        updatedAt: isoNow(),
      }
      await db.sessions.add(session)
      const subjectName = data.subjects.find((s) => s.id === actualSubjectId)?.name ?? 'Unknown Subject'
      await updateRoutineLogsForSession(session)
      await updateStreakDayForSession(session)
      syncSession(session, subjectName)
      await loadData()
      let description = `Logged ${logDuration}m${project ? ` for ${project.name}` : ` study for ${subjectName}`}`
      if (task) description += ` (${task.title})`
      push({
        description,
        undo: async () => { await db.sessions.delete(session.id); await revertStreakDayForSession(session); await loadData() },
        redo: async () => { await db.sessions.add(session); await updateStreakDayForSession(session); await loadData() },
      })
    }
    sessionStorage.removeItem(LOG_FORM_KEY)
    setLogSubjectId('')
    setLogProjectId('')
    setLogTaskId('')
    setLogNote('')
    setLogHobbyMode(false)
    setLogHobbyId('')
  }

  const [editLog, setEditLog] = useState<Session | null>(null)
  const [editDuration, setEditDuration] = useState(30)
  const [editDate, setEditDate] = useState(todayStr)
  const [liveTimerSeconds, setLiveTimerSeconds] = useState(0)
  const [liveTimerSubjectId, setLiveTimerSubjectId] = useState<string | null>(null)
  useEffect(() => {
    // Always poll every second — if no timer is active, just show 0
    const tick = () => {
      const active = isTimerActive()
      setLiveTimerSeconds(active ? getLiveTimerSeconds() : 0)
      setLiveTimerSubjectId(active ? getLiveTimerSubjectId() : null)
    }
    tick()
    const interval = window.setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [])
  const [editSubjectId, setEditSubjectId] = useState('')

  async function saveEditLog() {
    if (!editLog) return
    const prevSession = { ...editLog }
    // Preserve original time-of-day; only change date if user picked a different date
    const originalStart = new Date(editLog.startAt)
    const newStart = new Date(`${editDate}T${originalStart.toTimeString().slice(0, 8)}`)
    const newEnd = new Date(newStart.getTime() + editDuration * 60_000)
    const updated: Record<string, unknown> = {
      startAt: newStart.toISOString(),
      endAt: newEnd.toISOString(),
      durationMinutes: editDuration,
      subjectId: editSubjectId,
      updatedAt: isoNow(),
    }
    await db.sessions.update(editLog.id, updated)
    await updateStreakDayForSession({ ...editLog, ...updated })
    await loadData()
    setEditLog(null)
    push({
      description: `Edited session`,
      undo: async () => { await db.sessions.update(editLog.id, { startAt: prevSession.startAt, endAt: prevSession.endAt, durationMinutes: prevSession.durationMinutes, subjectId: prevSession.subjectId, updatedAt: prevSession.updatedAt }); await loadData() },
      redo: async () => { await db.sessions.update(editLog.id, updated); await loadData() },
    })
  }

  async function deleteSession(id: string) {
    const session = data.sessions.find((s) => s.id === id)
    if (!session) return
    await db.sessions.delete(id)
    syncSessionDelete(id)
    await revertRoutineLogsForSession(session)
    await revertStreakDayForSession(session)
    await loadData()
    push({
      description: `Deleted session (${session.durationMinutes}m)`,
      undo: async () => { await db.sessions.add(session); await updateRoutineLogsForSession(session); await updateStreakDayForSession(session); await syncSession(session, data.subjects.find(s => s.id === session.subjectId)?.name ?? 'Unknown'); await loadData() },
      redo: async () => { await db.sessions.delete(id); await revertRoutineLogsForSession(session); await revertStreakDayForSession(session); await syncSessionDelete(id); await loadData() },
    })
  }

  const settings = useMemo(() => loadSettings(), [])
  if (isLoading) return <PageSpinner />
  const todayMinutes = academicSessions
    .filter((s) => format(new Date(s.startAt), 'yyyy-MM-dd') === todayStr)
    .reduce((sum, s) => sum + s.durationMinutes, 0)
  const liveTotalTodayMinutes = getTotalTodayMinutes(data.sessions, data.subjects, data.categories)
  const weekStart = new Date()
  weekStart.setDate(weekStart.getDate() - weekStart.getDay())
  weekStart.setHours(0, 0, 0, 0)
  const weekMinutes = academicSessions
    .filter((s) => new Date(s.startAt) >= weekStart)
    .reduce((sum, s) => sum + s.durationMinutes, 0)
  const goalPct = Math.min(100, Math.round((todayMinutes / settings.dailyTargetMinutes) * 100))
  const allRecent = academicSessions
    .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime())
    .slice(0, 50)
    .map((s) => ({
      ...s,
      subjectName: data.subjects.find((sub) => sub.id === s.subjectId)?.name ?? 'Unknown',
      subjectColor: data.subjects.find((sub) => sub.id === s.subjectId)?.color ?? '#94a3b8',
    }))
  const recentSessions = showAllRecent ? allRecent : allRecent.slice(0, 5)

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
      {/* Auto-logged sessions banner */}
      {data.sessions.filter(s => s.source === 'autoRoutine' && s.deletedAt).length > 0 && (
        <Card className="border-primary-200 bg-primary-50 dark:border-primary-800 dark:bg-primary-900/20">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-primary-900 dark:text-primary-100">
              {data.sessions.filter(s => s.source === 'autoRoutine' && s.deletedAt).length} auto-logged sessions ready to confirm
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={async () => {
                for (const s of data.sessions.filter(s => s.source === 'autoRoutine' && s.deletedAt)) {
                  await db.sessions.delete(s.id)
                }
                await loadData()
              }}>Skip All</Button>
              <Button size="sm" variant="primary" onClick={async () => {
                for (const s of data.sessions.filter(s => s.source === 'autoRoutine' && s.deletedAt)) {
                  await db.sessions.update(s.id, { deletedAt: null, updatedAt: isoNow() })
                }
                await loadData()
              }}>Confirm All</Button>
            </div>
          </div>
        </Card>
      )}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Dashboard</h2>
        <Button variant="secondary" size="sm" onClick={() => setCustomizeOpen(true)}>Customise</Button>
      </div>

      {/* Today's Study Time — prominent card */}
      <Card className="border-primary-200 bg-primary-50 dark:border-primary-800 dark:bg-primary-900/20">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-primary-600 dark:text-primary-400">
              Today's Study Time
            </div>
            <div className="mt-1 text-3xl font-bold text-slate-800 dark:text-slate-100">
              {formatTotalToday(liveTotalTodayMinutes, isTimerActive())}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-500 dark:text-slate-400">Daily target</div>
            <div className="text-lg font-semibold text-slate-700 dark:text-slate-300">
              {formatMinutes(settings.dailyTargetMinutes)}
            </div>
            {goalPct >= 100 ? (
              <div className="text-xs font-medium text-green-600 dark:text-green-400">Target reached!</div>
            ) : (
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {formatMinutes(settings.dailyTargetMinutes - Math.round(liveTotalTodayMinutes))} remaining
              </div>
            )}
          </div>
        </div>
      </Card>
      {isWidgetVisible('pomodoro') && (
        <Collapsible id="dash-pomodoro" title="Study Timer" defaultOpen={true}>
          <div className="rounded-lg border-2 border-primary-500 p-4">
            <PomodoroTimer />
          </div>
        </Collapsible>
      )}

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

      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center gap-4 text-sm">
            <span>
              Today: <strong className="text-slate-800 dark:text-slate-100">{formatMinutes(todayMinutes)}</strong>
            </span>
            <span className="text-slate-300 dark:text-slate-600">|</span>
            <span>
              Week: <strong className="text-slate-800 dark:text-slate-100">{formatMinutes(weekMinutes)}</strong>
            </span>
            <span className="text-slate-300 dark:text-slate-600">|</span>
            <span>
              Sessions: <strong className="text-slate-800 dark:text-slate-100">{data.sessions.length}</strong>
            </span>
          </div>
        </div>
      {isWidgetVisible('today') && (
        <Collapsible id="dash-today" title="Today" defaultOpen={true}>
          <Card>
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
                      {/* Today's routines list */}
                      <TodaysRoutinesList
                        routines={data.routines}
                        routineLogs={data.routineLogs}
                        subjects={data.subjects}
                        todayStr={todayStr}
                        todayDow={new Date().getDay() as DayOfWeek}
                        maxItems={5}
                      />
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

            {/* Subject breakdown */}
            <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-700">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Today by Subject</span>
              </div>
              <SubjectBreakdown
                sessions={academicSessions}
                subjects={data.subjects}
                todayStr={todayStr}
                liveTimerSeconds={liveTimerSeconds}
                liveTimerSubjectId={liveTimerSubjectId}
              />
            </div>
          </Card>
        </Collapsible>
      )}

      {isWidgetVisible('streak-goal') && (() => {
        // 90-day heatmap data — column = day-of-week, row = week (most recent at bottom)
        const HEATMAP_DAYS = 60
        const heatDays = Array.from({ length: HEATMAP_DAYS }, (_, i) => {
          const d = subDays(new Date(), HEATMAP_DAYS - 1 - i)
          const ds = format(d, 'yyyy-MM-dd')
          return { date: d, ds, minutes: minutesByDay[ds] ?? 0 }
        })
        const heatMax90 = Math.max(60, ...heatDays.map((d) => d.minutes))
        const dayLabels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
        // Layout: pad so first column is Sunday
        const firstDow = heatDays[0].date.getDay()
        function getIntensityStep(minutes: number, max: number): number {
          const intensity = max > 0 ? minutes / max : 0
          if (intensity === 0) return 0
          if (intensity < 0.2) return 1
          if (intensity < 0.4) return 2
          if (intensity < 0.6) return 3
          return 4 // >= 0.6
        }
        return (
        <Collapsible id="dash-streak-goal" title="Streak & Goal" defaultOpen={true}>
          <div className="grid gap-4 sm:grid-cols-2 items-start">
            <Card>
              <div className="flex items-end justify-between">
                <div className="flex items-end gap-2">
                  <span className="text-4xl font-bold text-orange-500">{streak}</span>
                  <span className="text-sm text-slate-500">day{streak !== 1 ? 's' : ''}</span>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <div>Best <span className="font-semibold text-slate-700 dark:text-slate-200">{longestStreak}</span></div>
                </div>
              </div>
              {streak === 0 && <p className="mt-2 text-sm text-slate-500">Log a session today to start your streak!</p>}
              <div className="mt-3">
                <div className="mb-1 grid grid-cols-7 gap-px text-[10px] font-medium text-slate-400">
                  {dayLabels.map((l, i) => (
                    <div key={i} className="text-center">{l}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-px rounded-sm border border-slate-200 bg-slate-200 dark:border-slate-700 dark:bg-slate-700 p-px">
                  {Array.from({ length: firstDow }).map((_, i) => <div key={`pad-${i}`} />)}
                  {heatDays.map(({ date, ds, minutes }) => {
                    const isToday = ds === todayStr
                    const isMissed = minutes === 0 && !isToday
                    const step = getIntensityStep(minutes, heatMax90)
                    return (
                      <div
                        key={ds}
                        className={cn(
                          'group relative flex h-4 items-center justify-center text-[10px] font-medium transition-all',
                          isToday && 'ring-2 ring-orange-400 ring-inset z-10',
                          isMissed && 'bg-red-50 dark:bg-red-900/20',
                          !isMissed && step === 0 && 'bg-white dark:bg-slate-800',
                          step === 1 && 'bg-orange-200 dark:bg-orange-900/50',
                          step === 2 && 'bg-orange-400 dark:bg-orange-800',
                          step === 3 && 'bg-orange-600 text-white dark:bg-orange-700',
                          step === 4 && 'bg-orange-800 text-white dark:bg-orange-900',
                        )}
                      >
                        <span>{date.getDate()}</span>
                        <div className="pointer-events-none absolute -top-8 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100 dark:bg-slate-200 dark:text-slate-800">
                          {format(date, 'd MMM')}: {minutes}m
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1 text-[10px] text-slate-500">
                  <span>Milestones:</span>
                  {STREAK_MILESTONES.map((m) => (
                    <span
                      key={m}
                      className={cn(
                        'rounded-full px-2 py-0.5 font-medium',
                        longestStreak >= m
                          ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
                          : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                      )}
                    >
                      {m}d
                    </span>
                  ))}
                </div>
              </div>
            </Card>
            <Card>
              <div className="flex items-end gap-2">
                <span className="text-4xl font-bold text-primary-600">{goalPct}%</span>
                <span className="text-sm text-slate-500">of {settings.dailyTargetMinutes}m</span>
              </div>
              <div className="mt-3 h-3 w-full rounded-full bg-slate-200"><div className={cn('h-3 rounded-full transition-all', goalPct >= 100 ? 'bg-green-500' : 'bg-primary-500')} style={{ width: `${goalPct}%` }} /></div>
              {goalPct >= 100 && <p className="mt-2 text-sm font-medium text-green-600">Goal reached!</p>}
              {goalPct < 100 && todayMinutes > 0 && <p className="mt-2 text-sm text-slate-500">{formatMinutes(settings.dailyTargetMinutes - todayMinutes)} to go</p>}
            </Card>
          </div>
        </Collapsible>
        )
      })()}

      {isWidgetVisible('quick-timer') && (
        <Collapsible id="dash-quick-timer" title="Quick Timer" defaultOpen={true}>
          <QuickTimer />
        </Collapsible>
      )}
      {isWidgetVisible('study-review') && (
        <Collapsible id="dash-study-review" title="Study Review" defaultOpen={true}>
          <Card>
            <CardHeader>
              <CardTitle>
                <Link to="/study/review" className="hover:underline">Study Review</Link>
              </CardTitle>
            </CardHeader>
            <div className="px-6 pb-4">
              {(() => {
                const activeAreas = data.studyAreas.filter(a => !a.deletedAt)
                const dueCount = getDueCount(activeAreas)
                if (activeAreas.length === 0) {
                  return (
                    <div className="text-sm text-slate-500">
                      No study areas yet. <Link to="/study" className="text-primary-600 hover:underline">Add your first area</Link>.
                    </div>
                  )
                }
                if (dueCount === 0) {
                  return <div className="text-sm text-slate-500">No areas due today. Check back later.</div>
                }
                return (
                  <div>
                    <p className="text-3xl font-bold text-amber-600">{dueCount}</p>
                    <p className="text-sm text-slate-500 mt-1">
                      area{dueCount === 1 ? '' : 's'} due today
                    </p>
                    <Link to="/study/review">
                      <Button size="sm" className="mt-3">Start Review</Button>
                    </Link>
                  </div>
                )
              })()}
            </div>
          </Card>
        </Collapsible>
      )}

      {isWidgetVisible('calendar') && (
        <Collapsible id="dash-calendar" title="Study Calendar" defaultOpen={false}>
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
                const isFuture = dateStr > todayStr
                return (
                  <div
                    key={dayNum}
                    title={`${dateStr}: ${formatMinutes(mins)}`}
                    className={cn(
                      'flex h-9 flex-col items-center justify-center rounded text-xs transition-all',
                      isToday && 'ring-2 ring-primary-500',
                      isFuture && 'text-slate-300 dark:text-slate-600',
                      !isFuture && mins === 0 && 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
                      mins > 0 && 'text-white font-medium',
                      mins > 0 && intensity < 0.2 && 'bg-green-200 dark:bg-green-900/50',
                      mins > 0 && intensity >= 0.2 && intensity < 0.4 && 'bg-green-400 dark:bg-green-800',
                      mins > 0 && intensity >= 0.4 && intensity < 0.6 && 'bg-green-600 dark:bg-green-700',
                      mins > 0 && intensity >= 0.6 && intensity < 0.8 && 'bg-green-700 dark:bg-green-600',
                      mins > 0 && intensity >= 0.8 && 'bg-green-800 dark:bg-green-500',
                    )}
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
              <div className="h-3 w-3 rounded-sm bg-green-200 dark:bg-green-900/50" />
              <div className="h-3 w-3 rounded-sm bg-green-600 dark:bg-green-700" />
              <div className="h-3 w-3 rounded-sm bg-green-800 dark:bg-green-500" />
              <span>Full</span>
            </div>
          </Card>
        </Collapsible>
      )}

      {isWidgetVisible('recent') && (() => {
        const groups: { label: string; items: typeof recentSessions }[] = []
        const todayKey = format(new Date(), 'yyyy-MM-dd')
        const yesterdayKey = format(subDays(new Date(), 1), 'yyyy-MM-dd')
        for (const s of recentSessions) {
          const ds = format(new Date(s.startAt), 'yyyy-MM-dd')
          let label: string
          if (ds === todayKey) label = 'Today'
          else if (ds === yesterdayKey) label = 'Yesterday'
          else label = format(new Date(s.startAt), 'EEE d MMM')
          let g = groups.find((x) => x.label === label)
          if (!g) {
            g = { label, items: [] }
            groups.push(g)
          }
          g.items.push(s)
        }
        return (
        <Collapsible id="dash-recent" title="Recent Sessions" defaultOpen={false}>
          <Card>
            {recentSessions.length === 0 ? (
              <p className="text-sm text-slate-500">No sessions yet. Start studying!</p>
            ) : (
              <div className="space-y-3">
                {allRecent.length > 5 && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="text-xs font-medium text-primary-600 hover:underline"
                      onClick={() => setShowAllRecent((v) => !v)}
                    >
                      {showAllRecent ? 'Show less' : `Show all (${allRecent.length})`}
                    </button>
                  </div>
                )}
                {groups.map((g) => (
                  <div key={g.label}>
                    <div className="sticky top-0 z-10 -mx-1 bg-white/90 px-1 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500 backdrop-blur dark:bg-slate-800/90">{g.label}</div>
                    <ul className="divide-y divide-slate-200">
                      {g.items.map((session) => {
                        const project = session.projectId ? data.projects.find((p) => p.id === session.projectId) : undefined
                        return (
                          <li key={session.id} className="flex items-center justify-between py-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: session.subjectColor }} />
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{session.subjectName}{project && <span className="text-slate-500"> · {project.name}</span>}</div>
                                <div className="text-xs text-slate-500">{format(new Date(session.startAt), 'h:mm a')}{session.source === 'timer' ? ' ⏱' : session.source === 'pomodoro' ? ' 🍅' : ' ✏️'}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="text-sm text-slate-600">{formatMinutes(session.durationMinutes)}</div>
                              <div className="relative">
                                <button
                                  type="button"
                                  aria-label="More actions"
                                  onClick={() => setMenuSessionId(menuSessionId === session.id ? null : session.id)}
                                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
                                >
                                  <span className="block text-lg leading-none">⋯</span>
                                </button>
                                {menuSessionId === session.id && (
                                  <>
                                    <div className="fixed inset-0 z-20" onClick={() => setMenuSessionId(null)} />
                                    <div className="absolute right-0 z-30 mt-1 w-36 rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-800">
                                      <button
                                        type="button"
                                        className="block w-full px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-700"
                                        onClick={() => {
                                          setEditLog(session)
                                          setEditDuration(session.durationMinutes)
                                          setEditDate(format(new Date(session.startAt), 'yyyy-MM-dd'))
                                          setEditSubjectId(session.subjectId)
                                          setMenuSessionId(null)
                                        }}
                                      >
                                        Edit time
                                      </button>
                                      <button
                                        type="button"
                                        className="block w-full px-3 py-1.5 text-left text-red-600 hover:bg-slate-100 dark:hover:bg-slate-700"
                                        onClick={() => {
                                          deleteSession(session.id)
                                          setMenuSessionId(null)
                                        }}
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))}

              </div>
            )}
          </Card>
        </Collapsible>
        )
      })()}

      {/* Floating Log Time button */}
      <div className="fixed bottom-6 right-6 z-40 group">
        <div className="mb-2 rounded bg-slate-800 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 dark:bg-slate-200 dark:text-slate-800 pointer-events-none absolute bottom-full right-0 whitespace-nowrap">
          Log Study Time
        </div>
        <Button
          className="h-14 w-14 rounded-full p-0 text-2xl shadow-lg"
          onClick={() => setLogModalOpen(true)}
          aria-label="Log study time"
        >
          ⏱
        </Button>
      </div>

      <Modal open={logModalOpen} onClose={() => setLogModalOpen(false)} title="Log Study Time">
        <div className="space-y-3">
          {(() => {
            const existingToday = getTotalTodayMinutes(data.sessions, data.subjects, data.categories)
            const previewTotal = existingToday + logDuration
            const target = settings.dailyTargetMinutes
            const toGo = Math.max(0, target - previewTotal)
            return (
              <div className="text-sm text-slate-600 dark:text-slate-400">
                Today: {formatMinutes(previewTotal)} (of {formatMinutes(target)} goal) — {toGo > 0 ? `${formatMinutes(toGo)} to go` : 'goal reached'}
              </div>
            )
          })()}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setLogHobbyMode(false); setLogHobbyId('') }}
              className={cn('px-3 py-1.5 rounded text-sm font-medium', !logHobbyMode ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600')}
            >
              Study
            </button>
            <button
              type="button"
              onClick={() => { setLogHobbyMode(true); setLogSubjectId(''); setLogProjectId(''); setLogTaskId('') }}
              className={cn('px-3 py-1.5 rounded text-sm font-medium', logHobbyMode ? 'bg-primary-500 text-white' : 'bg-slate-100 text-slate-600')}
            >
              Hobby
            </button>
          </div>
          {logHobbyMode ? (
            <div>
              <label className="label">Hobby</label>
              <select className="input" value={logHobbyId} onChange={(e) => setLogHobbyId(e.target.value)}>
                <option value="">Select hobby</option>
                {data.hobbies.filter(h => !h.deletedAt).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </div>
          ) : (
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
                    {data.projects.filter((p) => !p.deletedAt && p.subjectId === logSubjectId).map((p) => (
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
          )}
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="label">Minutes</label>
              <input type="text" inputMode="numeric" pattern="[0-9]*" className="input w-24" value={logDuration === 1 ? '' : String(logDuration)} onChange={(e) => { const v = e.target.value; if (v === '') { setLogDuration(1); return }; const n = Number(v); if (isNaN(n)) return; setLogDuration(Math.max(1, n)) }} />
            </div>
            <div>
              <label className="label">Date</label>
              <input type="date" className="input" max={todayStr} value={logDate} onChange={(e) => setLogDate(e.target.value)} />
            </div>
            <div className="flex-1">
              <label className="label">Note (optional)</label>
              <input className="input w-full" placeholder="What did you work on?" value={logNote} onChange={(e) => setLogNote(e.target.value)} />
            </div>
            <Button
              disabled={logHobbyMode ? !logHobbyId : (!logSubjectId && !logProjectId)}
              onClick={async () => {
                await handleLogTime()
                setLogModalOpen(false)
              }}
            >
              Log Time
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Session Modal */}
      <Modal open={editLog !== null} onClose={() => setEditLog(null)} title="Edit Session">
        <div className="space-y-3">
          <div>
            <label className="label">Minutes</label>
            <input type="text" inputMode="numeric" pattern="[0-9]*" className="input" value={editDuration === 1 ? '' : String(editDuration)} onChange={(e) => { const v = e.target.value; if (v === '') { setEditDuration(1); return }; const n = Number(v); if (isNaN(n)) return; setEditDuration(Math.max(1, n)) }} />
          </div>
          <div>
            <label className="label">Date</label>
            <input type="date" className="input" max={todayStr} value={editDate} onChange={(e) => setEditDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Subject</label>
            <select className="input" value={editSubjectId} onChange={(e) => setEditSubjectId(e.target.value)}>
              <option value="">— Select subject —</option>
              {data.subjects.filter((s) => !s.deletedAt).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <Button variant="primary" className="w-full" onClick={saveEditLog}>Save</Button>
        </div>
      </Modal>
    </div>
  )
}
