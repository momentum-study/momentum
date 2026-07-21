import { TodaysRoutinesList } from '../../components/widgets/TodaysRoutinesList'
import { ActivityConfirmationCard } from '../../components/widgets/ActivityConfirmationCard'
import { SubjectBreakdown } from '../../components/widgets/SubjectBreakdown'
import { formatTotalToday, getLiveTimerSeconds, getLiveTimerSubjectId, getTotalTodayMinutes, isTimerActive } from '../../lib/timer-utils'
import { useEffect, useMemo, useState } from 'react'
import { format, subDays, differenceInCalendarDays } from 'date-fns'
import { v4 as uuid } from 'uuid'
import { PomodoroTimer } from '../../components/widgets/PomodoroTimer'
import { useData } from '../../app/providers'
import { useUndo } from '../../lib/use-undo'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader, CardTitle } from '../../components/ui/Card'
import { PageSpinner } from '../../components/ui/Spinner'
import { Modal } from '../../components/ui/Modal'
import { HoverCard } from '../../components/ui/HoverCard'
import { useSwipe } from '../../lib/use-swipe'
import { cn, formatMinutes, getSessionScope, isoNow, toLocalDateString } from '../../lib/utils'
import { loadSettings } from '../settings/SettingsPage'
import { db } from '../../db/app-db'
import { updateRoutineLogsForSession, revertRoutineLogsForSession, updateStreakDayForSession, revertStreakDayForSession } from '../../lib/routine-tracker'
import { getDueCount } from '../../lib/fsrs-scheduler'
import { useSessionSync } from '../../lib/use-session-sync'
import type { Session, DayOfWeek, RoutineLog } from '../../domain/types'
import { Link, useNavigate } from 'react-router-dom'
import { useDashboardWidgets, DASHBOARD_WIDGETS_METADATA } from '../../lib/use-dashboard-widgets'
import { DashboardWidget } from '../../components/widgets/DashboardWidget'

const STREAK_MILESTONES = [7, 14, 21, 30, 66, 100] as const
const BEST_STREAK_KEY = 'momentum-best-streak'
const CELEBRATION_KEY = 'momentum-last-celebration'
function copySessionInfo(session: Session & { subjectName: string }) {
  const time = format(new Date(session.startAt), 'h:mm a')
  const src = session.source === 'timer' ? 'timer' : session.source === 'pomodoro' ? 'pomodoro' : session.source === 'quickLog' ? 'quick log' : session.source === 'autoRoutine' ? 'routine' : 'manual'
  navigator.clipboard.writeText(`${session.subjectName} · ${formatMinutes(session.durationMinutes)} · ${time} · ${src}`).catch(() => {})
}

function SessionRow({
  session, project, subjects, menuSessionId, setMenuSessionId,
  setEditLog, setEditDuration, setEditDate, setEditSubjectId,
  showEditRowId, setShowEditRowId, deleteSession,
  editDuration, editDate, editSubjectId, saveEditLog, todayStr,
  selected, onToggleSelect,
}: {
  session: Session & { subjectName: string; subjectColor: string }
  project: { name: string } | undefined
  subjects: { id: string; name: string; deletedAt?: string | null }[]
  menuSessionId: string | null
  setMenuSessionId: (id: string | null) => void
  setEditLog: (s: Session | null) => void
  setEditDuration: (n: number) => void
  setEditDate: (s: string) => void
  setEditSubjectId: (s: string) => void
  showEditRowId: string | null
  setShowEditRowId: (id: string | null) => void
  deleteSession: (id: string) => void
  editDuration: number
  editDate: string
  editSubjectId: string
  saveEditLog: () => Promise<void>
  todayStr: string
  selected: boolean
  onToggleSelect: (id: string) => void
}) {
  const swipe = useSwipe({
    onSwipeLeft: () => deleteSession(session.id),
    onSwipeRight: () => {
      setEditLog(session)
      setEditDuration(session.durationMinutes)
      setEditDate(toLocalDateString(session.startAt))
      setEditSubjectId(session.subjectId)
      setShowEditRowId(session.id)
    },
  })
  const srcLabel = session.source === 'timer' ? 'timer' : session.source === 'pomodoro' ? 'pomodoro' : session.source === 'quickLog' ? 'quick log' : session.source === 'autoRoutine' ? 'routine' : 'manual'
  return (
    <>
      <li
        key={session.id}
        className="flex items-center justify-between py-2"
        onDoubleClick={() => {
          setEditLog(session)
          setEditDuration(session.durationMinutes)
          setEditDate(toLocalDateString(session.startAt))
          setEditSubjectId(session.subjectId)
          setShowEditRowId(session.id)
        }}
        {...swipe}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(session.id)}
          className="h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-primary-600 focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-700"
          aria-label={`Select session ${session.subjectName}`}
        />
        <HoverCard
          content={
            <div className="space-y-1 text-sm">
              <div className="font-medium">{session.subjectName}</div>
              {project && <div className="text-slate-500">{project.name}</div>}
              <div className="text-slate-500">{format(new Date(session.startAt), 'h:mm a')} · {formatMinutes(session.durationMinutes)}</div>
              <div className="text-slate-500">Source: {srcLabel}</div>
              {session.note && <div className="text-slate-400 italic">{session.note}</div>}
            </div>
          }
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: session.subjectColor }} />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{session.subjectName}{project && <span className="text-slate-500"> · {project.name}</span>}</div>
              <div className="text-xs text-slate-500">{format(new Date(session.startAt), 'h:mm a')}{session.source === 'timer' ? ' ⏱' : session.source === 'pomodoro' ? ' 🍅' : ' ✏️'}</div>
            </div>
          </div>
        </HoverCard>
        <div className="flex items-center gap-2">
          <div className="text-sm text-slate-600">{formatMinutes(session.durationMinutes)}</div>
          <div className="relative">
            <button type="button" aria-label="More actions" onClick={() => setMenuSessionId(menuSessionId === session.id ? null : session.id)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700">
              <span className="block text-lg leading-none">⋯</span>
            </button>
            {menuSessionId === session.id && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setMenuSessionId(null)} />
                <div className="absolute right-0 z-30 mt-1 w-36 rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-800">
                  <button type="button" className="block w-full px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-700" onClick={() => { setEditLog(session); setEditDuration(session.durationMinutes); setEditDate(toLocalDateString(session.startAt)); setEditSubjectId(session.subjectId); setShowEditRowId(session.id); setMenuSessionId(null) }}>
                    Edit time
                  </button>
                  <button type="button" className="block w-full px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-700" onClick={() => { copySessionInfo(session); setMenuSessionId(null) }}>
                    Copy
                  </button>
                  <button type="button" className="block w-full px-3 py-1.5 text-left text-red-600 hover:bg-slate-100 dark:hover:bg-slate-700" onClick={() => { deleteSession(session.id); setMenuSessionId(null) }}>
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </li>
      {showEditRowId === session.id && (
        <li className="bg-slate-50 dark:bg-slate-800 px-3 py-3 border-l-4 border-primary-500">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <div>
                <label className="label text-xs">Minutes</label>
                <input type="text" inputMode="numeric" pattern="[0-9]*" className="input w-20" value={editDuration === 1 ? '' : String(editDuration)} onChange={(e) => { const v = e.target.value; if (v === '') { setEditDuration(1); return }; const n = Number(v); if (isNaN(n)) return; setEditDuration(Math.max(1, n)) }} />
              </div>
              <div>
                <label className="label text-xs">Date</label>
                <input type="date" className="input" max={todayStr} value={editDate} onChange={(e) => setEditDate(e.target.value)} />
              </div>
              <div>
                <label className="label text-xs">Subject</label>
                <select className="input" value={editSubjectId} onChange={(e) => setEditSubjectId(e.target.value)}>
                  <option value="">— Select subject —</option>
                  {subjects.filter((s) => !s.deletedAt).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="primary" className="text-xs" onClick={async () => { await saveEditLog(); setShowEditRowId(null) }}>Save</Button>
              <Button variant="secondary" className="text-xs" onClick={() => { setEditLog(null); setShowEditRowId(null) }}>Cancel</Button>
            </div>
          </div>
        </li>
      )}
    </>
  )
}

export default function Dashboard() {
  const { data, isLoading, loadData } = useData()
  const { syncSession, syncSessionDelete } = useSessionSync()
  const { push } = useUndo()
  const { visibleWidgets, setVisibleWidgets, widgetConfigs, reorderWidgets, toggleWidgetSize } = useDashboardWidgets()
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const [logModalOpen, setLogModalOpen] = useState(false)
  const [recentLimit, setRecentLimit] = useState(10)
  const [menuSessionId, setMenuSessionId] = useState<string | null>(null)
  const [showActivityCard, setShowActivityCard] = useState(true)
  const [showCelebration, setShowCelebration] = useState(false)
  const navigate = useNavigate()
  const [fabOpen, setFabOpen] = useState(false)
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set())
  const [batchSubjectModalOpen, setBatchSubjectModalOpen] = useState(false)
  const [batchSubjectId, setBatchSubjectId] = useState('')

  const todayStr = format(new Date(), 'yyyy-MM-dd')
  // Exclude soft-deleted sessions from streak / stats calculations.
  const academicSessions = useMemo(
    () => data.sessions.filter((s) => !s.deletedAt && getSessionScope(s, data.subjects, data.categories) === 'academic'),
    [data.sessions, data.subjects, data.categories]
  )
  const settings = useMemo(() => loadSettings(), [])

  const streak = useMemo(() => {
    const daySet = new Set<string>()
    for (const s of academicSessions) {
      daySet.add(toLocalDateString(s.startAt))
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
      daySet.add(toLocalDateString(s.startAt))
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
  // Celebration: trigger once per day when the daily goal is met or a streak
  // milestone is reached today. Guarded by localStorage so it only fires once.
  useEffect(() => {
    try {
      const today = format(new Date(), 'yyyy-MM-dd')
      const last = localStorage.getItem(CELEBRATION_KEY)
      if (last === today) return
      const dailyMins = academicSessions
        .filter((s) => toLocalDateString(s.startAt) === today)
        .reduce((sum, s) => sum + s.durationMinutes, 0)
      const targetMet = dailyMins >= settings.dailyTargetMinutes
      const reachedMilestone = STREAK_MILESTONES.includes(
        streak as (typeof STREAK_MILESTONES)[number],
      )
      if (targetMet || reachedMilestone) {
        localStorage.setItem(CELEBRATION_KEY, today)
        setShowCelebration(true)
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streak, academicSessions, settings.dailyTargetMinutes])
  // Auto-hide celebration after 2 seconds
  useEffect(() => {
    if (!showCelebration) return
    const timer = setTimeout(() => setShowCelebration(false), 2000)
    return () => clearTimeout(timer)
  }, [showCelebration])


  const [calendarMonth, setCalendarMonth] = useState(new Date())
  const minutesByDay = useMemo(() => {
    const map: Record<string, number> = {}
    for (const s of academicSessions) {
      const day = toLocalDateString(s.startAt)
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
  const [logFocusTag, setLogFocusTag] = useState<Session['focusTag'] | null>(persistedForm?.focusTag ?? null)

  useEffect(() => {
    sessionStorage.setItem(LOG_FORM_KEY, JSON.stringify({
      subjectId: logSubjectId, projectId: logProjectId, taskId: logTaskId,
      duration: logDuration, date: logDate, note: logNote, focusTag: logFocusTag,
    }))
  }, [logSubjectId, logProjectId, logTaskId, logDuration, logDate, logNote, logFocusTag])

  // Close FAB on click outside or Escape
  useEffect(() => {
    if (!fabOpen) return
    function onClick(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest('.fab-container')) {
        setFabOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setFabOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [fabOpen])

  async function handleLogTime() {
    const note = logNote.trim()
    // Use noon local time on the selected date so the ISO instant always
    // round-trips back to the same calendar date regardless of timezone
    // (midnight shifts a day back in UTC, current-time shifts unpredictably).
    const [y, m, d] = logDate.split('-').map(Number)
    const startAt = new Date(y, m - 1, d, 12, 0, 0, 0).toISOString()
    const endAt = new Date(y, m - 1, d, 12, 0, logDuration * 60, 0).toISOString()

    if (!logSubjectId && !logProjectId) return
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
      focusTag: logFocusTag ?? undefined,
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
    sessionStorage.removeItem(LOG_FORM_KEY)
    setLogSubjectId('')
    setLogProjectId('')
    setLogTaskId('')
    setLogNote('')
    setLogFocusTag(null)
  }

  const [editLog, setEditLog] = useState<Session | null>(null)
  const [editDuration, setEditDuration] = useState(30)
  const [editDate, setEditDate] = useState(todayStr)
  const [liveTimerSeconds, setLiveTimerSeconds] = useState(0)
  const [liveTimerSubjectId, setLiveTimerSubjectId] = useState<string | null>(null)
  useEffect(() => {
    let interval: number | null = null
    let active = isTimerActive()
    const tick = () => {
      const nowActive = isTimerActive()
      setLiveTimerSeconds(nowActive ? getLiveTimerSeconds() : 0)
      setLiveTimerSubjectId(nowActive ? getLiveTimerSubjectId() : null)
      if (nowActive !== active) {
        active = nowActive
        if (interval) clearInterval(interval)
        interval = window.setInterval(tick, active ? 1000 : 5000)
      }
    }
    tick()
    interval = window.setInterval(tick, active ? 1000 : 5000)
  }, [])
  const [editSubjectId, setEditSubjectId] = useState('')
  const [showEditRowId, setShowEditRowId] = useState<string | null>(null)

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
      durationSeconds: editDuration * 60,
      subjectId: editSubjectId,
      updatedAt: isoNow(),
    }
    await db.sessions.update(editLog.id, updated)
    await updateStreakDayForSession({ ...editLog, ...updated })
    await loadData()
    setEditLog(null)
    push({
      description: `Edited session`,
      undo: async () => { await db.sessions.update(editLog.id, { startAt: prevSession.startAt, endAt: prevSession.endAt, durationMinutes: prevSession.durationMinutes, durationSeconds: prevSession.durationSeconds, subjectId: prevSession.subjectId, updatedAt: prevSession.updatedAt }); await loadData() },
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

  async function deleteSelectedSessions() {
    for (const id of selectedSessionIds) {
      const session = data.sessions.find(s => s.id === id)
      if (session) {
        await db.sessions.delete(id)
        syncSessionDelete(id)
        await revertRoutineLogsForSession(session)
        await revertStreakDayForSession(session)
      }
    }
    setSelectedSessionIds(new Set())
    await loadData()
  }

  async function batchChangeSubject() {
    if (!batchSubjectId) return
    for (const id of selectedSessionIds) {
      await db.sessions.update(id, { subjectId: batchSubjectId, updatedAt: isoNow() })
    }
    setSelectedSessionIds(new Set())
    setBatchSubjectModalOpen(false)
    setBatchSubjectId('')
    await loadData()
  }


  if (isLoading) return <PageSpinner />
  const todayMinutes = academicSessions
    .filter((s) => toLocalDateString(s.startAt) === todayStr)
    .reduce((sum, s) => sum + s.durationMinutes, 0)
  const liveTotalTodayMinutes = getTotalTodayMinutes(data.sessions, data.subjects, data.categories)
  const goalPct = Math.min(100, Math.round((todayMinutes / settings.dailyTargetMinutes) * 100))
  const allRecent = academicSessions
    .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime())
    .slice(0, 50)
    .map((s) => ({
      ...s,
      subjectName: data.subjects.find((sub) => sub.id === s.subjectId)?.name ?? 'Unknown',
      subjectColor: data.subjects.find((sub) => sub.id === s.subjectId)?.color ?? '#94a3b8',
    }))
  const recentSessions = allRecent.slice(0, recentLimit)

  const isWidgetVisible = (id: string) => visibleWidgets.includes(id)
  const toggleWidget = (id: string) => {
    if (visibleWidgets.includes(id)) {
      setVisibleWidgets(visibleWidgets.filter((w) => w !== id))
    } else {
      setVisibleWidgets([...visibleWidgets, id])
    }
  }

  return (
    <div data-tour="dashboard" className="space-y-6">
      {/* Auto-logged sessions widget */}
      {isWidgetVisible('auto-log') && (
        <div>
          <DashboardWidget
            id="auto-log"
            label="Pending Auto-Logs"
            size={widgetConfigs['auto-log']?.size || 'small'}
            onRemove={() => toggleWidget('auto-log')}
            onToggleSize={() => toggleWidgetSize('auto-log')}
            onReorder={reorderWidgets}
          >
            {(() => {
              const pendingSessions = data.sessions.filter(s => s.source === 'autoRoutine' && s.deletedAt)
              if (pendingSessions.length === 0) {
                return <p className="text-sm text-slate-500 p-4">No pending auto-logged sessions</p>
              }
              return (
                <div className="space-y-3 p-2">
                  {pendingSessions.map(session => {
                    const subject = data.subjects.find(s => s.id === session.subjectId)
                    const project = session.projectId ? data.projects.find(p => p.id === session.projectId) : undefined
                    return (
                      <div key={session.id} className="flex items-center justify-between p-2 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800">
                        <div className="flex min-w-0 items-center gap-2">
                          {subject && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: subject.color }} />}
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                              {subject?.name ?? 'Unknown Subject'}
                              {project && <span className="text-slate-500"> · {project.name}</span>}
                            </div>
                            <div className="text-xs text-slate-500">
                              {format(new Date(session.startAt), 'h:mm a')} • {formatMinutes(session.durationMinutes)}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={async () => {
                              await db.sessions.delete(session.id)
                              await loadData()
                            }}
                          >
                            Skip
                          </Button>
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={async () => {
                              await db.sessions.update(session.id, { deletedAt: null, updatedAt: isoNow() })
                              await loadData()
                            }}
                          >
                            Confirm
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </DashboardWidget>
        </div>
      )}
      {/* Dashboard grid with widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 auto-rows-min">
        {/* Today's Study Time (always visible) */}
        <div className="lg:col-span-1 lg:row-span-1">
          <DashboardWidget id="stats" label="Today & This Week" size="small">
            <div className="flex flex-col items-center justify-center py-2">
              <div className="text-xs font-medium uppercase tracking-wide text-primary-600 dark:text-primary-400">
                Today's Study Time
              </div>
              <div className="mt-1 text-3xl font-bold text-slate-800 dark:text-slate-100">
                {formatTotalToday(liveTotalTodayMinutes, isTimerActive())}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Daily target: {formatMinutes(settings.dailyTargetMinutes)}
              </div>
              {goalPct >= 100 ? (
                <div className="text-xs font-medium text-green-600 dark:text-green-400">Target reached!</div>
              ) : (
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {formatMinutes(settings.dailyTargetMinutes - Math.round(liveTotalTodayMinutes))} remaining
                </div>
              )}
            </div>
          </DashboardWidget>
        </div>
        {isWidgetVisible('pomodoro') && (
          <div>
            <DashboardWidget
              id="pomodoro"
              label="Study Timer"
              size={widgetConfigs['pomodoro']?.size || 'small'}
              onRemove={() => toggleWidget('pomodoro')}
              onToggleSize={() => toggleWidgetSize('pomodoro')}
              onReorder={reorderWidgets}
            >
              <div data-tour="timer" className="rounded-lg border-2 border-primary-500 p-4">
                <PomodoroTimer />
              </div>
            </DashboardWidget>
          </div>
        )}
        {isWidgetVisible('today') && (
          <div>
            <DashboardWidget
              id="today"
              label="Today Overview"
              size={widgetConfigs['today']?.size || 'small'}
              onRemove={() => toggleWidget('today')}
              onToggleSize={() => toggleWidgetSize('today')}
              onReorder={reorderWidgets}
            >
              <Card>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-8">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Routines</span>
                      <Link to="/routines" className="text-xs text-primary-600 hover:underline">Manage</Link>
                    </div>
                    {(() => {
                      const todayDow = new Date().getDay() as DayOfWeek
                      const todaysRoutines = data.routines.filter((r) => !r.deletedAt && (r.dayMinutes[todayDow] ?? 0) > 0)
                      if (todaysRoutines.length === 0) return <p className="text-sm text-slate-500">No routines scheduled</p>
                      const logMap: Record<string, RoutineLog> = {}
                      data.routineLogs.forEach((l) => { if (l.date === todayStr) logMap[l.routineId] = l })
                      const scheduled = todaysRoutines.reduce((s, r) => s + (r.dayMinutes[todayDow] ?? 0), 0)
                      const completed = todaysRoutines.reduce((s, r) => {
                        const log = logMap[r.id]
                        return s + (log ? Math.min(log.actualMinutes, r.dayMinutes[todayDow] ?? 0) : 0)
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
            </DashboardWidget>
          </div>
        )}
        {isWidgetVisible('streak-goal') && (
          <div>
            <DashboardWidget
              id="streak-goal"
              label="Study Streak & Daily Goal"
              size={widgetConfigs['streak-goal']?.size || 'small'}
              onRemove={() => toggleWidget('streak-goal')}
              onToggleSize={() => toggleWidgetSize('streak-goal')}
              onReorder={reorderWidgets}
            >
              {(() => {
                const HEATMAP_DAYS = 60
                const heatDays = Array.from({ length: HEATMAP_DAYS }, (_, i) => {
                  const d = subDays(new Date(), HEATMAP_DAYS - 1 - i)
                  const ds = format(d, 'yyyy-MM-dd')
                  return { date: d, ds, minutes: minutesByDay[ds] ?? 0 }
                })
                const targetMinutes = Math.max(1, settings.dailyTargetMinutes)
                const dayLabels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
                const firstDow = heatDays[0].date.getDay()
                function getHeatCategory(minutes: number): 'none' | 'started' | 'near' | 'met' {
                  if (minutes <= 0) return 'none'
                  if (minutes >= targetMinutes) return 'met'
                  if (minutes >= targetMinutes * 0.75) return 'near'
                  return 'started'
                }
                const nextMilestone = STREAK_MILESTONES.find((m) => m > streak) ?? streak
                const progressPercent = Math.min(100, Math.round((streak / nextMilestone) * 100))
                return (
                  <div className="space-y-3">
                    <div className="flex items-end justify-between">
                      <div className="flex items-end gap-2">
                        <div className="relative w-16 h-16">
                          <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                            <circle
                              className="text-slate-200 dark:text-slate-700"
                              stroke="currentColor"
                              strokeWidth="3"
                              fill="transparent"
                              r="16"
                              cx="18"
                              cy="18"
                            />
                            <circle
                              className="text-orange-500"
                              stroke="currentColor"
                              strokeWidth="3"
                              strokeLinecap="round"
                              fill="transparent"
                              r="16"
                              cx="18"
                              cy="18"
                              strokeDasharray="100"
                              strokeDashoffset={100 - progressPercent}
                              style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                            />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center text-2xl font-bold text-orange-500">
                            {streak}
                          </div>
                        </div>
                        <span className="text-sm text-slate-500">day{streak !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="text-right text-xs text-slate-500">
                        <div>Best <span className="font-semibold text-slate-700 dark:text-slate-200">{longestStreak}</span></div>
                      </div>
                    </div>
                    {streak === 0 && <p className="text-sm text-slate-500">Log a session today to start your streak!</p>}
                    <div>
                      <div className="mb-1 grid grid-cols-7 gap-px text-[10px] font-medium text-slate-400">
                        {dayLabels.map((l, i) => (
                          <div key={i} className="text-center">{l}</div>
                        ))}
                      </div>
                      <div className="relative">
                       <div className="grid grid-cols-7 gap-px rounded-sm border border-slate-200 bg-slate-200 dark:border-slate-700 dark:bg-slate-700 p-px">
                        {Array.from({ length: firstDow }).map((_, i) => <div key={`pad-${i}`} />)}
                        {heatDays.map(({ date, ds, minutes }) => {
                          const isToday = ds === todayStr
                          const category = getHeatCategory(minutes)
                          const metTarget = minutes >= targetMinutes
                          return (
                            <div
                              key={ds}
                              className={cn(
                                'group relative flex h-4 items-center justify-center text-[10px] font-medium transition-all border',
                                isToday && 'ring-2 ring-orange-400 ring-inset z-10',
                                category === 'none' && 'border-slate-300 bg-slate-100 text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400',
                                category === 'started' && 'border-amber-200 bg-amber-200 text-amber-900 dark:border-amber-800 dark:bg-amber-900/50 dark:text-amber-100',
                                category === 'near' && 'border-orange-400 bg-orange-500 text-white dark:border-orange-300 dark:bg-orange-600',
                                category === 'met' && 'border-green-600 bg-green-700 text-white dark:border-green-400 dark:bg-green-500',
                              )}
                            >
                              <span>{date.getDate()}</span>
                              <div className="pointer-events-none absolute -top-10 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100 dark:bg-slate-200 dark:text-slate-800">
                                {format(date, 'd MMM')}: {formatMinutes(minutes)} • {metTarget ? 'Target met' : minutes > 0 ? 'Below target' : 'No study'}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px border-l-2 border-red-500 border-dashed" aria-hidden="true">
                        <span className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold text-red-500">Goal</span>
                      </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1 text-[10px] text-slate-500">
                      <span>No study</span>
                      <div className="h-3 w-3 rounded-sm border border-slate-300 bg-slate-100 dark:border-slate-600 dark:bg-slate-800" />
                      <span>Started</span>
                      <div className="h-3 w-3 rounded-sm border border-amber-200 bg-amber-200 dark:border-amber-800 dark:bg-amber-900/50" />
                      <span>Near target</span>
                      <div className="h-3 w-3 rounded-sm border border-orange-400 bg-orange-500" />
                      <span>Target met</span>
                      <div className="h-3 w-3 rounded-sm border border-green-600 bg-green-700 dark:border-green-400 dark:bg-green-500" />
                    </div>
                    <div className="text-xs text-slate-500">Streak milestones:</div>
                    <div className="flex flex-wrap gap-2">
                      {STREAK_MILESTONES.map((m) => {
                        const reached = longestStreak >= m
                        const approaching = m === nextMilestone
                        return (
                          <div key={m} className="group relative">
                            <div
                              className={cn(
                                'rounded-full px-3 py-1 text-xs font-semibold transition-all',
                                reached
                                  ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
                                  : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
                                approaching && !reached && 'animate-[milestone-pulse_2s_ease-in-out_infinite]'
                              )}
                            >
                              {reached && <span className="mr-1">🔥</span>}
                              {m}d
                            </div>
                            <div className="pointer-events-none absolute -top-8 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100 dark:bg-slate-200 dark:text-slate-800">
                              {reached ? `${m} days — milestone reached!` : `Reach ${m} days`}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    {goalPct >= 100 && <div className="text-sm font-medium text-green-600">Goal reached!</div>}
                    {goalPct < 100 && todayMinutes > 0 && <div className="text-sm text-slate-500">{formatMinutes(settings.dailyTargetMinutes - todayMinutes)} to go</div>}
                  </div>
                )
              })()}
            </DashboardWidget>
          </div>
        )}
        {isWidgetVisible('study-review') && (
          <div>
            <DashboardWidget
              id="study-review"
              label="Study Review"
              size={widgetConfigs['study-review']?.size || 'small'}
              onRemove={() => toggleWidget('study-review')}
              onToggleSize={() => toggleWidgetSize('study-review')}
              onReorder={reorderWidgets}
            >
              <Card>
                <CardHeader>
                  <CardTitle>
                    <Link to="/study/review" className="hover:underline">Study Review</Link>
                  </CardTitle>
                </CardHeader>
                <div className="px-4 pb-4">
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
            </DashboardWidget>
          </div>
        )}
        {isWidgetVisible('calendar') && (
          <div>
            <DashboardWidget
              id="calendar"
              label="Study Calendar"
              size={widgetConfigs['calendar']?.size || 'small'}
              defaultOpen={false}
              onRemove={() => toggleWidget('calendar')}
              onToggleSize={() => toggleWidgetSize('calendar')}
              onReorder={reorderWidgets}
            >
              <Card>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700">←</button>
                    <span className="text-sm font-medium">{format(calendarMonth, 'MMMM yyyy')}</span>
                    <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700">→</button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-1 text-center text-xs mb-1">
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
            </DashboardWidget>
          </div>
        )}
        {isWidgetVisible('recent') && (
          <div>
            <DashboardWidget
              id="recent"
              label="Recent Sessions"
              size={widgetConfigs['recent']?.size || 'small'}
              defaultOpen={false}
              onRemove={() => toggleWidget('recent')}
              onToggleSize={() => toggleWidgetSize('recent')}
              onReorder={reorderWidgets}
            >
              {(() => {
                const groups: { label: string; items: typeof recentSessions }[] = []
                const todayKey = format(new Date(), 'yyyy-MM-dd')
                const yesterdayKey = format(subDays(new Date(), 1), 'yyyy-MM-dd')
                for (const s of recentSessions) {
                  const ds = toLocalDateString(s.startAt)
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
                  <Card>
                    {recentSessions.length === 0 ? (
                      <p className="text-sm text-slate-500">No sessions yet. Start studying!</p>
                    ) : (
                      <div className="space-y-3">
                        {selectedSessionIds.size > 0 && (
                          <div className="flex items-center justify-between gap-2 rounded-md border border-primary-300 bg-primary-50 px-3 py-2 dark:border-primary-700 dark:bg-primary-900/30">
                            <span className="text-sm font-medium text-primary-900 dark:text-primary-100">
                              {selectedSessionIds.size} selected
                            </span>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => setSelectedSessionIds(new Set())}
                              >
                                Clear
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => setBatchSubjectModalOpen(true)}
                              >
                                Change Subject
                              </Button>
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={async () => {
                                  if (confirm(`Delete ${selectedSessionIds.size} session(s)?`)) {
                                    await deleteSelectedSessions()
                                  }
                                }}
                              >
                                Delete Selected
                              </Button>
                            </div>
                          </div>
                        )}
                        {allRecent.length > recentLimit && (
                          <div className="flex justify-end">
                            <button
                              type="button"
                              className="text-xs font-medium text-primary-600 hover:underline"
                              onClick={() => setRecentLimit((n) => n + 10)}
                            >
                              Load more
                            </button>
                          </div>
                        )}
                        {academicSessions.length > 50 && (
                          <div className="text-right text-xs text-slate-500">
                            Showing {recentSessions.length} of {academicSessions.length}
                          </div>
                        )}
                        {groups.map((g) => (
                          <div key={g.label}>
                            <div className="sticky top-0 z-10 -mx-1 bg-white/90 px-1 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500 backdrop-blur dark:bg-slate-800/90">{g.label}</div>
                            <ul className="divide-y divide-slate-200">
                              {g.items.map((session) => {
                                const project = session.projectId ? data.projects.find((p) => p.id === session.projectId) : undefined
                                return (
                                  <SessionRow
                                    key={session.id}
                                    session={session}
                                    project={project}
                                    subjects={data.subjects}
                                    menuSessionId={menuSessionId}
                                    setMenuSessionId={setMenuSessionId}
                                    setEditLog={setEditLog}
                                    setEditDuration={setEditDuration}
                                    setEditDate={setEditDate}
                                    setEditSubjectId={setEditSubjectId}
                                    showEditRowId={showEditRowId}
                                    setShowEditRowId={setShowEditRowId}
                                    deleteSession={deleteSession}
                                    editDuration={editDuration}
                                    editDate={editDate}
                                    editSubjectId={editSubjectId}
                                    saveEditLog={saveEditLog}
                                    todayStr={todayStr}
                                    selected={selectedSessionIds.has(session.id)}
                                    onToggleSelect={(id) => setSelectedSessionIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })}
                                  />
                                )
                              })}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                )
              })()}
            </DashboardWidget>
          </div>
        )}
      </div>
      <Modal open={customizeOpen} onClose={() => setCustomizeOpen(false)} title="Customise Dashboard">
        <div className="space-y-2">
          {DASHBOARD_WIDGETS_METADATA.map((w) => (
            <div key={w.id} className="flex items-center justify-between">
              <span className="text-sm">{w.label}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleWidgetSize(w.id)}
                  className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700"
                >
                  {widgetConfigs[w.id]?.size || 'small'}
                </button>
                <input type="checkbox" checked={visibleWidgets.includes(w.id)} onChange={() => toggleWidget(w.id)} />
              </div>
            </div>
          ))}
        </div>
        <Button className="mt-4 w-full" onClick={() => setCustomizeOpen(false)}>Done</Button>
      </Modal>
      {showActivityCard && (
        <ActivityConfirmationCard onDismiss={() => setShowActivityCard(false)} />
      )}

      <div className="fixed bottom-6 right-6 z-40 fab-container">
        {fabOpen && (
          <div className="absolute bottom-16 right-0 mb-4 flex flex-col items-end gap-2">
            {[
              { label: 'Log study time', icon: '⏱', onClick: () => { setLogModalOpen(true); setFabOpen(false) } },
              { label: 'Start quick Pomodoro', icon: '🍅', onClick: () => { navigate('/study'); setFabOpen(false) } },
              { label: 'Add a new mark', icon: '📝', onClick: () => { navigate('/marks'); setFabOpen(false) } },
              { label: 'Add a new task', icon: '📅', onClick: () => { navigate('/calendar'); setFabOpen(false) } },
              { label: 'Add a new subject', icon: '+', onClick: () => { navigate('/subjects'); setFabOpen(false) } },
            ].map((action, i) => (
              <div key={i} className="group relative flex items-center">
                <div className="absolute right-14 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 dark:bg-slate-200 dark:text-slate-800 pointer-events-none">
                  {action.label}
                </div>
                <button
                  onClick={action.onClick}
                  className="h-10 w-10 rounded-full border border-slate-200 bg-white shadow-md transition-all duration-200 hover:scale-110 dark:border-slate-600 dark:bg-slate-700 flex items-center justify-center"
                >
                  {action.icon}
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          onClick={() => setFabOpen(!fabOpen)}
          className={cn(
            "h-14 w-14 rounded-full bg-primary-600 text-white shadow-lg transition-all duration-200 text-2xl flex items-center justify-center",
            !fabOpen && "animate-pulse",
            fabOpen && "rotate-45"
          )}
          aria-label="Quick add"
        >
          +
        </button>
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
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="label">Subject</label>
              <select className="input" value={logSubjectId} onChange={(e) => { setLogSubjectId(e.target.value); setLogProjectId(''); setLogTaskId('') }}>
                <option value="">Select subject</option>
                {data.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            {logSubjectId && data.projects.filter((p) => !p.deletedAt && p.subjectId === logSubjectId).length > 0 && (
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
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="label">Minutes</label>
              <input type="text" inputMode="numeric" pattern="[0-9]*" className="input w-24" value={logDuration === 0 ? '' : String(logDuration)} onChange={(e) => { const v = e.target.value; if (v === '') { setLogDuration(0); return }; const n = Number(v); if (isNaN(n)) return; setLogDuration(n) }} />
            </div>
            <div>
              <label className="label">Date</label>
              <input type="date" className="input" max={todayStr} value={logDate} onChange={(e) => setLogDate(e.target.value)} />
            </div>
            <div className="flex-1">
              <label className="label">Note (optional)</label>
              <input className="input w-full" placeholder="What did you work on?" value={logNote} onChange={(e) => setLogNote(e.target.value)} />
            </div>
            <div className="w-full">
              <label className="label">Focus quality (optional)</label>
              <div className="flex gap-1 flex-wrap" role="group" aria-label="Focus tag">
                {(['focused', 'distracted', 'group', 'revision'] as const).map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setLogFocusTag(logFocusTag === tag ? null : tag)}
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs border',
                      logFocusTag === tag
                        ? 'border-primary-500 bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-200'
                        : 'border-slate-300 text-slate-500 dark:border-slate-600 dark:text-slate-400'
                    )}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
            <Button
              disabled={!logSubjectId && !logProjectId}
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
      {/* Batch Change Subject Modal */}
      <Modal open={batchSubjectModalOpen} onClose={() => { setBatchSubjectModalOpen(false); setBatchSubjectId('') }} title="Change Subject for Selected Sessions">
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            This will change the subject for {selectedSessionIds.size} selected session(s).
          </p>
          <div>
            <label className="label">New Subject</label>
            <select className="input" value={batchSubjectId} onChange={(e) => setBatchSubjectId(e.target.value)}>
              <option value="">— Select subject —</option>
              {data.subjects.filter((s) => !s.deletedAt).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setBatchSubjectModalOpen(false); setBatchSubjectId('') }}>Cancel</Button>
            <Button variant="primary" disabled={!batchSubjectId} onClick={batchChangeSubject}>Apply</Button>
          </div>
        </div>
      </Modal>
      {/* Celebration confetti overlay */}
      {showCelebration && (
        <div className="pointer-events-none fixed inset-0 z-50">
          {Array.from({ length: 25 }).map((_, i) => {
            const colors = ['bg-orange-400', 'bg-yellow-400', 'bg-red-400', 'bg-pink-400', 'bg-green-400']
            const left = Math.random() * 100
            const delay = Math.random() * 0.5
            const size = 4 + Math.random() * 6
            return (
              <div
                key={i}
                className={cn('absolute rounded-full', colors[i % colors.length])}
                style={{
                  left: `${left}%`,
                  bottom: '50%',
                  width: `${size}px`,
                  height: `${size}px`,
                  animation: `confetti-fall 2s ease-out ${delay}s forwards`,
                }}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
