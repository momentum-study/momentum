import { useState, useMemo } from 'react'
import { format, subDays } from 'date-fns'
import { useData } from '../../app/providers'
import { db } from '../../db/app-db'
import { cn, isoNow } from '../../lib/utils'
import { Button } from '../../components/ui/Button'
import { useUndo } from '../../lib/use-undo'
import { Card, CardHeader, CardTitle } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { ColorPicker } from '../../components/ui/ColorPicker'
import { v4 as uuid } from 'uuid'
import { TodaysRoutinesList } from '../../components/widgets/TodaysRoutinesList'
import type { Routine, RoutineLog, DayOfWeek } from '../../domain/types'

const DEFAULT_COLOR = '#6366f1'
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKDAY_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export default function RoutinePage() {
  const { data, loadData } = useData()
  const { push } = useUndo()
  const [tab, setTab] = useState<'routines' | 'schedule'>('routines')
  const [showModal, setShowModal] = useState(false)
  const [editRoutine, setEditRoutine] = useState<Routine | null>(null)
  const [name, setName] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [projectId, setProjectId] = useState<string | null>(null)
  const [targetMinutes, setTargetMinutes] = useState(30)
  const [days, setDays] = useState<DayOfWeek[]>([1, 3, 5])
  const [color, setColor] = useState(DEFAULT_COLOR)
  const [notes, setNotes] = useState('')
  const [autoLog, setAutoLog] = useState(false)
  const [autoLogMinutes, setAutoLogMinutes] = useState(30)
  const [scheduledTime, setScheduledTime] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [logMinutesRoutineId, setLogMinutesRoutineId] = useState<string | null>(null)
  const [logMinutesValue, setLogMinutesValue] = useState(0)
  const [isEditingSchedule, setIsEditingSchedule] = useState(false)
  const [scheduleDrafts, setScheduleDrafts] = useState<Record<string, { minutes: string; notes: string }>>({})
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({})

  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const todayDow = new Date().getDay() as DayOfWeek

  const activeRoutines = data.routines.filter((r) => !r.deletedAt)
  const todaysRoutines = useMemo(
    () => activeRoutines.filter((r) => r.days.includes(todayDow)),
    [activeRoutines, todayDow]
  )

  const routineLogsToday = useMemo(() => {
    const map: Record<string, RoutineLog> = {}
    data.routineLogs.forEach((log) => {
      if (log.date === todayStr) {
        map[log.routineId] = log
      }
    })
    return map
  }, [data.routineLogs, todayStr])

  const dailyProgress = useMemo(() => {
    const scheduledMinutes = todaysRoutines.reduce((sum, r) => sum + r.targetMinutes, 0)
    const completedMinutes = todaysRoutines.reduce((sum, r) => {
      const log = routineLogsToday[r.id]
      return sum + (log ? Math.min(log.actualMinutes, r.targetMinutes) : 0)
    }, 0)
    const remainingMinutes = Math.max(0, scheduledMinutes - completedMinutes)
    const routineCount = todaysRoutines.length
    const completedCount = todaysRoutines.filter((r) => routineLogsToday[r.id]?.completed).length
    return { scheduledMinutes, completedMinutes, remainingMinutes, routineCount, completedCount }
  }, [todaysRoutines, routineLogsToday])

  const scheduleMap = useMemo(() => {
    const map = new Map<string, { targetMinutes: number; notes: string }>()
    for (const entry of data.scheduleEntries) {
      map.set(`${entry.subjectId}:${entry.dayOfWeek}`, { targetMinutes: entry.targetMinutes, notes: entry.notes })
    }
    return map
  }, [data.scheduleEntries])

  const todaysSchedule = useMemo(() => {
    const rows = data.subjects
      .filter((s) => !s.deletedAt)
      .map((subject) => {
        const planned = scheduleMap.get(`${subject.id}:${todayDow}`)
        if (!planned || planned.targetMinutes <= 0) return null
        const actualMinutes = data.sessions
          .filter((s) => !s.deletedAt && s.subjectId === subject.id && s.startAt.slice(0, 10) === todayStr)
          .reduce((sum, s) => sum + s.durationMinutes, 0)
        const pct = planned.targetMinutes > 0 ? Math.round((actualMinutes / planned.targetMinutes) * 100) : 0
        return {
          subject,
          plannedMinutes: planned.targetMinutes,
          plannedNotes: planned.notes,
          actualMinutes,
          pct,
        }
      })
      .filter(Boolean) as {
        subject: typeof data.subjects[number]
        plannedMinutes: number
        plannedNotes: string
        actualMinutes: number
        pct: number
      }[]

    return rows.sort((a, b) => b.plannedMinutes - a.plannedMinutes)
  }, [data.subjects, data.scheduleEntries, data.sessions, scheduleMap, todayDow, todayStr])

  const projectsForSubject = useMemo(() => {
    if (!subjectId) return []
    return data.projects.filter((p) => p.subjectId === subjectId && !p.deletedAt)
  }, [data.projects, subjectId])

  const weekDates = useMemo(() => {
    const today = new Date()
    const sunday = subDays(today, today.getDay())
    return Array.from({ length: 7 }).map((_, i) => format(subDays(sunday, -i), 'yyyy-MM-dd'))
  }, [])

  const weekLogsByDate = useMemo(() => {
    const map: Record<string, RoutineLog[]> = {}
    weekDates.forEach((d) => { map[d] = [] })
    data.routineLogs.forEach((log) => {
      if (weekDates.includes(log.date) && map[log.date]) {
        map[log.date].push(log)
      }
    })
    return map
  }, [data.routineLogs, weekDates])

  const weeklyProgress = useMemo(() => {
    return activeRoutines.map((routine) => {
      const weeklyLogs = weekDates.reduce<RoutineLog[]>((acc, d) => {
        const dayLogs = weekLogsByDate[d]?.filter((l) => l.routineId === routine.id) ?? []
        return acc.concat(dayLogs)
      }, [])
      const totalMinutes = weeklyLogs.reduce((sum, l) => sum + l.actualMinutes, 0)
      const scheduledDays = routine.days.filter((d) =>
        weekDates.some((wd) => new Date(wd).getDay() === d)
      ).length
      const target = routine.targetMinutes * scheduledDays
      return {
        name: routine.name,
        subject: getSubjectName(routine.subjectId),
        daysLabel: getDaysLabel(routine.days),
        target,
        logged: totalMinutes,
        progress: target > 0 ? Math.round((totalMinutes / target) * 100) : 0,
      }
    })
  }, [activeRoutines, weekDates, weekLogsByDate])

  function getSubjectName(id: string): string {
    return data.subjects.find((s) => s.id === id)?.name ?? 'Unknown'
  }

  function getProjectName(id: string | null | undefined): string {
    if (!id) return ''
    return data.projects.find((p) => p.id === id)?.name ?? ''
  }

  function getDaysLabel(d: DayOfWeek[]): string {
    if (d.length === 0) return 'No days'
    if (d.length === 7) return 'Every day'
    const sorted = [...d].sort((a, b) => a - b)
    return sorted.map((dow) => WEEKDAYS[dow]).join(', ')
  }

  function getDaysBadges(d: DayOfWeek[]): JSX.Element[] {
    return WEEKDAY_SHORT.map((label, i) => {
      const isActive = d.includes(i as DayOfWeek)
      return (
        <span
          key={i}
          className={cn(
            'flex h-5 w-5 items-center justify-center rounded text-[10px] font-medium',
            isActive ? 'bg-slate-700 text-white dark:bg-slate-300 dark:text-slate-900' : 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-600'
          )}
        >
          {label}
        </span>
      )
    })
  }

  function openAddRoutine() {
    setEditRoutine(null)
    setName('')
    setSubjectId('')
    setProjectId(null)
    setTargetMinutes(30)
    setDays([1, 3, 5])
    setColor(DEFAULT_COLOR)
    setNotes('')
    setAutoLog(false)
    setAutoLogMinutes(30)
    setScheduledTime('')
    setShowModal(true)
  }
  function openEditRoutine(routine: Routine) {
    setEditRoutine(routine)
    setName(routine.name)
    setSubjectId(routine.subjectId)
    setProjectId(routine.projectId ?? null)
    setTargetMinutes(routine.targetMinutes)
    setDays(routine.days)
    setColor(routine.color)
    setNotes(routine.notes ?? '')
    setAutoLog(routine.autoLog ?? false)
    setAutoLogMinutes(routine.autoLogMinutes ?? 30)
    setScheduledTime(routine.scheduledTime ?? '')
    setShowModal(true)
  }

  async function saveRoutine() {
    if (!name.trim() || !subjectId) return
    try {
      if (editRoutine) {
        const prev = { ...editRoutine }
        await db.routines.update(editRoutine.id, {
          name: name.trim(),
          subjectId,
          projectId: projectId ?? undefined,
          targetMinutes,
          days,
          color,
          notes: notes || undefined,
          autoLog: autoLog || undefined,
          autoLogMinutes: autoLog ? autoLogMinutes : undefined,
          scheduledTime: scheduledTime || undefined,
          updatedAt: isoNow(),
        })
        push({
          description: `Updated routine "${name.trim()}"`,
          undo: async () => { await db.routines.update(prev.id, prev); await loadData() },
          redo: async () => {
            await db.routines.update(prev.id, {
              name: name.trim(), subjectId, projectId: projectId ?? undefined,
              targetMinutes, days, color,
              notes: notes || undefined, autoLog: autoLog || undefined,
              autoLogMinutes: autoLog ? autoLogMinutes : undefined,
              scheduledTime: scheduledTime || undefined, updatedAt: isoNow(),
            })
            await loadData()
          },
        })
      } else {
        const newId = uuid()
        const newRoutine = {
          id: newId, name: name.trim(), subjectId,
          projectId: projectId ?? undefined,
          targetMinutes, days, color,
          notes: notes || undefined,
          autoLog: autoLog || undefined,
          autoLogMinutes: autoLog ? autoLogMinutes : undefined,
          scheduledTime: scheduledTime || undefined,
          createdAt: isoNow(), updatedAt: isoNow(),
        }
        await db.routines.add(newRoutine)
        push({
          description: `Added routine "${newRoutine.name}"`,
          undo: async () => { await db.routines.delete(newId); await loadData() },
          redo: async () => { await db.routines.add(newRoutine); await loadData() },
        })
      }
      setShowModal(false)
      await loadData()
    } catch (e) {
      console.error('Failed to save routine', e)
    }
  }

  async function deleteRoutineFn(id: string) {
    try {
      const routine = data.routines.find((r) => r.id === id)
      if (!routine) return
      const prev = { ...routine }
      await db.routines.update(id, { deletedAt: isoNow() })
      push({
        description: `Deleted routine "${prev.name}"`,
        undo: async () => {
          await db.routines.update(id, { deletedAt: null })
          await loadData()
        },
        redo: async () => {
          await db.routines.update(id, { deletedAt: prev.deletedAt ?? null })
          await loadData()
        },
      })
      setDeleteConfirm(null)
      await loadData()
    } catch (e) {
      console.error('Failed to delete routine', e)
    }
  }

  function toggleDay(dow: DayOfWeek) {
    if (days.includes(dow)) {
      setDays(days.filter((d) => d !== dow))
    } else {
      setDays([...days, dow].sort((a, b) => a - b) as DayOfWeek[])
    }
  }
  async function saveLogMinutes() {
    if (!logMinutesRoutineId || logMinutesValue <= 0) return
    const routine = activeRoutines.find((r) => r.id === logMinutesRoutineId)
    if (!routine) return
    const newLogId = uuid()
    const newLog: RoutineLog = {
      id: newLogId,
      routineId: routine.id,
      date: todayStr,
      actualMinutes: logMinutesValue,
      completed: logMinutesValue >= routine.targetMinutes,
      createdAt: isoNow(),
    }
    try {
      await db.routineLogs.add(newLog)
      push({
        description: `Logged ${logMinutesValue} min for "${routine.name}"`,
        undo: async () => { await db.routineLogs.delete(newLogId); await loadData() },
        redo: async () => { await db.routineLogs.add(newLog); await loadData() },
      })
      setLogMinutesRoutineId(null)
      setLogMinutesValue(0)
      await loadData()
    } catch (e) {
      console.error('Failed to log minutes', e)
    }
  }

  async function skipWeek(routine: Routine) {
    const weekStart = format(subDays(new Date(), new Date().getDay()), 'yyyy-MM-dd')
    const isSkipped = routine.skippedWeekStart === weekStart
    const prev = { ...routine }
    await db.routines.update(routine.id, { skippedWeekStart: isSkipped ? '' : weekStart, updatedAt: isoNow() })
    push({ description: isSkipped ? `Unskipped "${routine.name}"` : `Skipped "${routine.name}" this week`, undo: async () => { await db.routines.update(routine.id, prev); await loadData() }, redo: async () => { await db.routines.update(routine.id, { skippedWeekStart: isSkipped ? '' : weekStart, updatedAt: isoNow() }); await loadData() } })
    await loadData()
  }

  function RoutineCard({ routine }: { routine: Routine }) {
    const isToday = routine.days.includes(todayDow)
    const log = routineLogsToday[routine.id]
    const pct = log ? Math.round((log.actualMinutes / routine.targetMinutes) * 100) : 0

    return (
      <Card>
        <div className="flex items-start gap-3">
          <div className="mt-1 h-3 w-3 flex-shrink-0 rounded-full" style={{ backgroundColor: routine.color }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-800 dark:text-slate-100 truncate">{routine.name}</span>
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              {getSubjectName(routine.subjectId)}
              {routine.projectId && <>{' · '}{getProjectName(routine.projectId)}</>}
            </div>
            {routine.notes && (
              <p className={cn('mt-1 text-xs text-slate-600 dark:text-slate-400 cursor-pointer', !expandedNotes[routine.id] && 'line-clamp-2')}
                onClick={() => setExpandedNotes(v => ({ ...v, [routine.id]: !v[routine.id] }))}>
                {routine.notes}
              </p>
            )}
            {routine.autoLog && (
              <span className="mt-1 inline-block rounded bg-primary-100 px-1.5 py-0.5 text-[10px] font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">🔄 Auto</span>
            )}
            <div className="mt-2 flex items-center gap-3">
              <div className="flex gap-1">{getDaysBadges(routine.days)}</div>
              <div className="text-xs text-slate-500">{routine.targetMinutes} min</div>
            </div>
          </div>
        </div>

        {isToday && (
          <div className="mt-3">
            {log ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600 dark:text-slate-400">{log.actualMinutes} / {routine.targetMinutes} min</span>
                  <span className={cn('font-medium', log.completed ? 'text-green-600 dark:text-green-400' : 'text-slate-500 dark:text-slate-400')}>{pct}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700">
                  <div style={{ width: `${Math.min(100, pct)}%` }} className={cn('h-2 rounded-full', pct >= 100 ? 'bg-green-500' : 'bg-primary-500')} />
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-400">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-700">Not done yet</span>
              </div>
            )}
            <div className="mt-2 flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => { setLogMinutesValue(routine.targetMinutes); setLogMinutesRoutineId(routine.id) }}>Log minutes</Button>
              {routine.autoLog && (
                <Button variant="secondary" size="sm" onClick={() => skipWeek(routine)}>
                  {routine.skippedWeekStart === format(subDays(new Date(), new Date().getDay()), 'yyyy-MM-dd') ? 'Unskip Week' : 'Skip Week'}
                </Button>
              )}
            </div>
          </div>
        )}

        {!isToday && (
          <div className="mt-2 text-xs text-slate-400">Not scheduled today</div>
        )}

        <div className="mt-3 flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => openEditRoutine(routine)}>Edit</Button>
          <Button variant="danger" size="sm" onClick={() => setDeleteConfirm(routine.id)}>Delete</Button>
        </div>
      </Card>
    )
  }
  function getDraftKey(subjectId: string, dayOfWeek: number): string { return `${subjectId}:${dayOfWeek}` }

  async function saveSchedule() {
    for (const [key, draft] of Object.entries(scheduleDrafts)) {
      const [subjectId, dowStr] = key.split(':')
      const dayOfWeek = Number(dowStr) as unknown as DayOfWeek
      const minutes = parseInt(draft.minutes)
      if (isNaN(minutes) || minutes <= 0) continue
      const existing = data.scheduleEntries.find(e => e.subjectId === subjectId && e.dayOfWeek === dayOfWeek)
      if (existing) {
        await db.scheduleEntries.update(existing.id, { targetMinutes: minutes, notes: draft.notes, updatedAt: isoNow() })
      } else {
        await db.scheduleEntries.add({
          id: uuid(),
          subjectId,
          dayOfWeek,
          targetMinutes: minutes,
          notes: draft.notes,
          createdAt: isoNow(),
          updatedAt: isoNow(),
        })
      }
    }
    setIsEditingSchedule(false)
    setScheduleDrafts({})
    await loadData()
  }

  function ScheduleGrid(): JSX.Element | null {
    const subjects = data.subjects.filter((s) => !s.deletedAt)
    const days: DayOfWeek[] = [1, 2, 3, 4, 5, 6, 0]

    function getSaved(subjectId: string, dayOfWeek: DayOfWeek): { targetMinutes: number; notes: string } | null {
      const ent = data.scheduleEntries.find(e => e.subjectId === subjectId && e.dayOfWeek === dayOfWeek)
      return ent ? { targetMinutes: ent.targetMinutes, notes: ent.notes } : null
    }

    function getDraft(subjectId: string, dayOfWeek: DayOfWeek): { minutes: string; notes: string } {
      const d = scheduleDrafts[getDraftKey(subjectId, dayOfWeek)]
      const saved = getSaved(subjectId, dayOfWeek)
      return d ?? (saved ? { minutes: String(saved.targetMinutes), notes: saved.notes } : { minutes: '', notes: '' })
    }

    function setDraft(subjectId: string, dayOfWeek: DayOfWeek, field: 'minutes' | 'notes', value: string) {
      const key = getDraftKey(subjectId, dayOfWeek)
      const cur = getDraft(subjectId, dayOfWeek)
      setScheduleDrafts(v => ({ ...v, [key]: { ...cur, [field]: value } }))
    }

    if (subjects.length === 0) return <p className="text-sm text-slate-500">Create a focus area first.</p>

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-xs text-slate-500">
              <th className="pb-2 pr-2 font-medium">Subject</th>
              {days.map(d => <th key={d} className="pb-2 px-2 font-medium">{WEEKDAYS[d]}</th>)}
            </tr>
          </thead>
          <tbody>
            {subjects.map(subject => (
              <tr key={subject.id} className="border-b last:border-b-0">
                <td className="py-2 pr-2 font-medium text-slate-800 dark:text-slate-100 whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: subject.color }} />
                    <span>{subject.name}</span>
                  </div>
                </td>
                {days.map(d => {
                  const draft = getDraft(subject.id, d)
                  return (
                    <td key={d} className="py-1 px-2">
                      {isEditingSchedule ? (
                        <>
                          <input type="text" inputMode="numeric" pattern="[0-9]*"
                            className="w-16 text-center rounded border border-slate-200 bg-white px-1 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                            placeholder="min"
                            value={draft.minutes}
                            onChange={(e) => setDraft(subject.id, d, 'minutes', e.target.value)} />
                          <input type="text" className="mt-0.5 block w-16 rounded border border-slate-200 bg-white px-1 text-[10px] leading-tight dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            placeholder="notes"
                            value={draft.notes}
                            onChange={(e) => setDraft(subject.id, d, 'notes', e.target.value)} />
                        </>
                      ) : (
                        <span className="block text-center text-xs text-slate-700 dark:text-slate-300">
                          {(() => {
                            const saved = getSaved(subject.id, d)
                            if (!saved) return '—'
                            return `${saved.targetMinutes}m` + (saved.notes ? ` · ${saved.notes}` : '')
                          })()}
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {isEditingSchedule && (
          <Button variant="primary" size="sm" className="mt-3" onClick={() => { saveSchedule(); setIsEditingSchedule(false) }}>
            Save Schedule
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Routines</h2>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-700">
            {(['routines', 'schedule'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={cn('rounded-md px-3 py-1 text-xs font-medium transition-colors',
                  tab === t ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-300 dark:text-slate-900' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200')}>
                {t === 'routines' ? 'Routines' : 'Schedule'}
              </button>
            ))}
          </div>
          <Button variant="primary" size="sm" onClick={openAddRoutine}>Add Routine</Button>
        </div>
      </div>

      {/* ── Schedule Tab ── */}
      {tab === 'schedule' && (
        <>
          {/* Today's Schedule */}
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Plan your week by allocating time per subject per day.
          </p>
          {todaysSchedule.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Today's Schedule</CardTitle></CardHeader>
              {todaysSchedule.map((row) => (
                <div key={row.subject.id} className="flex items-center gap-3 py-2 first:pt-0">
                  <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: row.subject.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{row.subject.name}</div>
                    {row.plannedNotes && <div className="text-xs text-slate-500 truncate">{row.plannedNotes}</div>}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-slate-600 dark:text-slate-400">{row.actualMinutes} / {row.plannedMinutes}m</span>
                    <div className={cn('h-2 w-16 rounded-full bg-slate-200 dark:bg-slate-700')}>
                      <div style={{ width: `${Math.min(100, row.pct)}%` }}
                        className={cn('h-2 rounded-full', row.pct >= 100 ? 'bg-green-500' : row.pct >= 50 ? 'bg-yellow-500' : 'bg-red-500')} />
                    </div>
                  </div>
                </div>
              ))}
            </Card>
          )}

          {/* Schedule Grid */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Weekly Schedule</CardTitle>
                <Button variant="secondary" size="sm" onClick={() => setIsEditingSchedule(!isEditingSchedule)}>
                  {isEditingSchedule ? 'Save Schedule' : 'Edit Schedule'}
                </Button>
              </div>
            </CardHeader>
            <ScheduleGrid />
          </Card>
        </>
      )}

      {/* ── Routines Tab ── */}
      {tab === 'routines' && (
        <>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Set daily targets for recurring goals (e.g., 30 mins reading).
      </p>
      {todaysRoutines.length > 0 && (
        <Card className="bg-primary-50 dark:bg-primary-900/20">
          <CardHeader>
            <CardTitle>Today's Routine Progress</CardTitle>
          </CardHeader>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <div className="text-sm text-slate-500">Routines</div>
              <div className="mt-1 text-2xl font-bold text-primary-600 dark:text-primary-400">
                {dailyProgress.completedCount} / {dailyProgress.routineCount} done
              </div>
            </div>
            <div>
              <div className="text-sm text-slate-500">Minutes Studied</div>
              <div className="mt-1 text-2xl font-bold text-slate-800 dark:text-slate-100">
                {dailyProgress.completedMinutes} / {dailyProgress.scheduledMinutes}m
              </div>
            </div>
            <div>
              <div className="text-sm text-slate-500">Remaining</div>
              <div className="mt-1 text-2xl font-bold text-orange-600 dark:text-orange-400">
                {dailyProgress.remainingMinutes}m
              </div>
            </div>
          </div>
          <div className="mt-3 h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700">
            <div className="h-2 rounded-full bg-primary-500 transition-all" style={{ width: `${dailyProgress.scheduledMinutes > 0 ? Math.min(100, Math.round((dailyProgress.completedMinutes / dailyProgress.scheduledMinutes) * 100)) : 0}%` }} />
          </div>
        </Card>
      )}

      {/* Today's routines compact list */}
      <TodaysRoutinesList
        routines={data.routines}
        routineLogs={data.routineLogs}
        subjects={data.subjects}
        todayStr={todayStr}
        todayDow={todayDow}
        maxItems={6}
        clickable
      />

      {/* 7-day mini calendar */}
      <Card>
        <div className="flex items-center justify-between">
          {weekDates.map((date, i) => {
            const dayOfWeek = new Date(date).getDay() as DayOfWeek
            const dayLogs = data.routineLogs.filter((l) => l.date === date)
            const scheduledRoutines = activeRoutines.filter((r) => r.days.includes(dayOfWeek))
            const hasLogs = dayLogs.length > 0
            const completedCount = dayLogs.filter((l) => l.completed).length
            const allComplete = scheduledRoutines.length > 0 && completedCount === scheduledRoutines.length
            const someComplete = completedCount > 0 && !allComplete
            const isTodayDate = date === todayStr

            return (
              <div key={date} className="flex flex-col items-center gap-1">
                <span className="text-[10px] text-slate-400">{WEEKDAY_SHORT[i]}</span>
                <div className={cn('flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium',
                  isTodayDate && 'ring-2 ring-primary-500',
                  allComplete ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : someComplete ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' : hasLogs ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400')}>
                  {new Date(date).getDate()}
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* This Week summary */}
      {activeRoutines.length > 0 && (
        <Card>
          <CardHeader><CardTitle>This Week</CardTitle></CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs text-slate-500">
                  <th className="pb-2 font-medium">Name</th>
                  <th className="pb-2 font-medium">Subject</th>
                  <th className="pb-2 font-medium">Days</th>
                  <th className="pb-2 font-medium">Target</th>
                  <th className="pb-2 font-medium">Logged</th>
                  <th className="pb-2 font-medium">Progress</th>
                </tr>
              </thead>
              <tbody>
                {weeklyProgress.map((rp, i) => (
                  <tr key={i} className="border-b last:border-b-0">
                    <td className="py-2 font-medium text-slate-800 dark:text-slate-100">{rp.name}</td>
                    <td className="py-2 text-slate-600 dark:text-slate-400">{rp.subject}</td>
                    <td className="py-2 text-slate-600 dark:text-slate-400">{rp.daysLabel}</td>
                    <td className="py-2 text-slate-600 dark:text-slate-400">{rp.target}m</td>
                    <td className="py-2 text-slate-600 dark:text-slate-400">{rp.logged}m</td>
                    <td className="py-2">
                      <span className={cn('font-medium', rp.progress >= 100 ? 'text-green-600 dark:text-green-400' : rp.progress >= 50 ? 'text-yellow-600 dark:text-yellow-400' : 'text-slate-500 dark:text-slate-400')}>{rp.progress}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeRoutines.length === 0 ? (
        <EmptyState title="No routines" description="Create a weekly study routine to track your progress." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {activeRoutines.map((routine) => (
            <RoutineCard key={routine.id} routine={routine} />
          ))}
        </div>
      )}
      </>
      )}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editRoutine ? 'Edit Routine' : 'Add Routine'}
      >
        <div className="space-y-3">
          <input className="input" placeholder="Name (e.g. Math Study Block)" value={name} onChange={(e) => setName(e.target.value)} />

          <select className="input" value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setProjectId(null) }}>
            <option value="">Select Focus Area</option>
            {data.subjects.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
          </select>

          {subjectId && projectsForSubject.length > 0 && (
            <select className="input" value={projectId ?? ''} onChange={(e) => setProjectId(e.target.value || null)}>
              <option value="">No Project (optional)</option>
              {projectsForSubject.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
            </select>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Target Minutes</label>
            <input type="text" inputMode="numeric" pattern="[0-9]*" className="input mt-1"
              value={targetMinutes === 5 ? '' : String(targetMinutes)}
              onChange={(e) => {
                const v = e.target.value
                if (v === '') { setTargetMinutes(5); return }
                const n = Number(v)
                if (isNaN(n)) return
                setTargetMinutes(Math.max(5, Math.min(480, n)))
              }} />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Days</label>
            <div className="mt-2 flex gap-2">
              {WEEKDAYS.map((label, i) => (
                <button key={i} type="button"
                  className={cn('flex h-8 w-10 items-center justify-center rounded text-sm font-medium transition-colors',
                    days.includes(i as DayOfWeek) ? 'bg-slate-700 text-white dark:bg-slate-300 dark:text-slate-900' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-400 dark:hover:bg-slate-600')}
                  onClick={() => toggleDay(i as DayOfWeek)}>{label}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Notes</label>
            <textarea className="input mt-1 min-h-[80px]" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes for this routine" />
          </div>

          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={autoLog} onChange={(e) => setAutoLog(e.target.checked)} />
              Auto-log this routine
            </label>
            {autoLog && (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Auto-log duration (minutes)</label>
                  <input type="text" inputMode="numeric" pattern="[0-9]*" className="input mt-1"
                    value={autoLogMinutes === 5 ? '' : String(autoLogMinutes)}
                    onChange={(e) => {
                      const v = e.target.value
                      if (v === '') { setAutoLogMinutes(5); return }
                      const n = Number(v)
                      if (isNaN(n)) return
                      setAutoLogMinutes(Math.max(5, Math.min(480, n)))
                    }} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Scheduled time (optional)</label>
                  <input className="input mt-1" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} placeholder="14:00" />
                </div>
              </div>
            )}
          </div>

          <ColorPicker value={color} onChange={setColor} />

          <Button variant="primary" className="w-full" onClick={saveRoutine} disabled={!name.trim() || !subjectId}>
            {editRoutine ? 'Save' : 'Add'}
          </Button>
        </div>
      </Modal>

      <Modal
        open={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        title="Delete Routine?"
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            This will soft-delete the routine. You can restore it later from the database if needed.
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setDeleteConfirm(null)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              onClick={() => deleteConfirm && deleteRoutineFn(deleteConfirm)}
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={logMinutesRoutineId !== null}
        onClose={() => setLogMinutesRoutineId(null)}
        title="Log Minutes"
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Minutes
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              className="input mt-1"
              value={logMinutesValue <= 0 ? '' : String(logMinutesValue)}
              onChange={(e) => {
                const v = e.target.value
                if (v === '') { setLogMinutesValue(0); return }
                const n = Number(v)
                if (isNaN(n)) return
                setLogMinutesValue(Math.max(0, Math.min(480, n)))
              }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Date
            </label>
            <input
              type="text"
              className="input mt-1"
              value={todayStr}
              readOnly
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setLogMinutesRoutineId(null)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={saveLogMinutes}
              disabled={logMinutesValue <= 0}
            >
              Save
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}