import { useState, useMemo } from 'react'
import { format, subDays, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, parseISO } from 'date-fns'
import { useData } from '../../app/providers'
import { db } from '../../db/app-db'
import { loadSettings } from '../settings/SettingsPage'
import { cn, isoNow } from '../../lib/utils'
import { useUndo } from '../../lib/use-undo'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader, CardTitle } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { ColorPicker } from '../../components/ui/ColorPicker'
import { v4 as uuid } from 'uuid'
import type { Habit, HabitLog } from '../../domain/types'

const DEFAULT_COLOR = '#6366f1'
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function HabitsPage() {
  const { data, loadData } = useData()
  const { push: pushUndo } = useUndo()
  const settings = loadSettings()
  const [showModal, setShowModal] = useState(false)
  const [editHabit, setEditHabit] = useState<Habit | null>(null)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<Habit['kind']>('good')
  const [color, setColor] = useState(DEFAULT_COLOR)
  const [archivedAfterDays, setArchivedAfterDays] = useState<number | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [archiveConfirm, setArchiveConfirm] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [dayDetailDate, setDayDetailDate] = useState<string | null>(null)
  
  const [showAddLog, setShowAddLog] = useState(false)
  const [logDate, setLogDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [logTime, setLogTime] = useState('')
  const [logNote, setLogNote] = useState('')
  const [logValue, setLogValue] = useState('')
  const [editLog, setEditLog] = useState<HabitLog | null>(null)
  
  const [calendarMonth, setCalendarMonth] = useState(new Date())

  // NOTE: hooks must be called unconditionally on every render — do NOT early-return before them.
  const selectedHabitLogs = useMemo(() => {
    if (!selectedId) return []
    return data.habitLogs
      .filter((l) => l.habitId === selectedId)
      .sort((a, b) => {
        const dateCmp = b.date.localeCompare(a.date)
        if (dateCmp !== 0) return dateCmp
        return (b.time || '').localeCompare(a.time || '')
      })
  }, [data.habitLogs, selectedId])
  const archivedHabits = data.habits.filter((h) => !!h.archivedAt)
  // Active = not archived AND not parked as a potential habit
  const currentHabits = data.habits.filter((h) => !h.archivedAt && h.status !== 'potential')
  const potentialHabits = data.habits.filter((h) => !h.archivedAt && h.status === 'potential')
  const goodHabits = currentHabits.filter((h) => h.kind === 'good')
  const badHabits = currentHabits.filter((h) => h.kind === 'bad')
  const selectedHabit = data.habits.find((h) => h.id === selectedId) ?? null
  const todayStr = format(new Date(), 'yyyy-MM-dd')

  // Check if we are over the habit limit
  const habitLimit = settings.maxActiveHabits
  const overLimit = currentHabits.length >= habitLimit


  const logsByDate = useMemo(() => {
    const groups: Record<string, HabitLog[]> = {}
    selectedHabitLogs.forEach((log) => {
      if (!groups[log.date]) groups[log.date] = []
      groups[log.date].push(log)
    })
    return groups
  }, [selectedHabitLogs])


  function getStreak(habitId: string): number {
    const habit = data.habits.find((h) => h.id === habitId)
    const isBad = habit?.kind === 'bad'
    const logDates = new Set(data.habitLogs.filter((l) => l.habitId === habitId).map((l) => l.date))
    // For bad habits with no logs, every day "counts" as a streak day → infinite loop without a cap.
    // Cap at the habit's age or 365 days, whichever is smaller.
    const maxDays = habit?.createdAt
      ? Math.min(365, Math.ceil((Date.now() - new Date(habit.createdAt).getTime()) / 86400000))
      : 365
    // Safety net: allow 1 missed day per week for good habits only.
    // For bad habits, a lapse resets the streak immediately.
    let streak = 0
    let missed = 0
    let d = new Date()
    while (streak < maxDays) {
      const ds = format(d, 'yyyy-MM-dd')
      const countsAsStreak = isBad ? !logDates.has(ds) : logDates.has(ds)
      if (countsAsStreak) {
        streak++
        missed = 0
        d = subDays(d, 1)
      } else {
        if (isBad) break
        missed++
        if (missed > 1) break
        d = subDays(d, 1)
      }
    }
    return streak
  }

  function getTodayCount(habitId: string): number {
    return data.habitLogs.filter((l) => l.habitId === habitId && l.date === todayStr).length
  }

  function getDaysLogged(habitId: string): number {
    const uniqueDays = new Set(data.habitLogs.filter((l) => l.habitId === habitId).map((l) => l.date))
    return uniqueDays.size
  }

  // One-click log: directly insert a timestamped log without opening a modal.
  // Undo is queued so the user can revert the mistake easily.
  async function quickLogToday(habitId: string) {
    const habit = data.habits.find((h) => h.id === habitId)
    const now = new Date()
    const newLog = {
      id: uuid(),
      habitId,
      date: format(now, 'yyyy-MM-dd'),
      time: format(now, 'HH:mm'),
      createdAt: isoNow(),
      updatedAt: isoNow(),
    }
    await db.habitLogs.add(newLog)
    await loadData()
    pushUndo({
      description: `Logged ${habit?.kind === 'bad' ? 'lapse' : 'occurrence'}: ${habit?.name ?? 'habit'}`,
      undo: async () => { await db.habitLogs.delete(newLog.id); await loadData() },
      redo: async () => { await db.habitLogs.add(newLog); await loadData() },
    })
  }

  async function saveLog() {
    if (!selectedId) return
    const habit = data.habits.find((h) => h.id === selectedId)
    const parsedValue = logValue.trim() ? Number(logValue) : undefined
    try {
      if (editLog) {
        const prevLog = await db.habitLogs.get(editLog.id)
        await db.habitLogs.update(editLog.id, {
          date: logDate,
          time: logTime || undefined,
          note: logNote.trim() || undefined,
          value: parsedValue,
          updatedAt: isoNow(),
        })
        await loadData()
        setShowAddLog(false)
        setEditLog(null)
        if (prevLog) {
          pushUndo({
            description: `Edited log for "${habit?.name ?? 'habit'}"`,
            undo: async () => { await db.habitLogs.update(editLog.id, prevLog); await loadData() },
            redo: async () => { await db.habitLogs.update(editLog.id, { date: logDate, time: logTime || undefined, note: logNote.trim() || undefined, value: parsedValue, updatedAt: isoNow() }); await loadData() },
          })
        }
      } else {
        const newLog = {
          id: uuid(),
          habitId: selectedId,
          date: logDate,
          time: logTime || undefined,
          note: logNote.trim() || undefined,
          value: parsedValue,
          createdAt: isoNow(),
          updatedAt: isoNow(),
        }
        await db.habitLogs.add(newLog)
        await loadData()
        setShowAddLog(false)
        setEditLog(null)
        pushUndo({
          description: `Logged ${habit?.kind === 'bad' ? 'lapse' : 'occurrence'}: ${habit?.name ?? 'habit'}`,
          undo: async () => { await db.habitLogs.delete(newLog.id); await loadData() },
          redo: async () => { await db.habitLogs.add(newLog); await loadData() },
        })
      }
    } catch (e) { console.error('Failed to save log', e) }
  }

  async function deleteLog(log: HabitLog) {
    try {
      await db.habitLogs.delete(log.id)
      await loadData()
      pushUndo({
        description: `Deleted log${log.note ? `: ${log.note}` : ''}`,
        undo: async () => { await db.habitLogs.add(log); await loadData() },
        redo: async () => { await db.habitLogs.delete(log.id); await loadData() },
      })
    } catch (e) { console.error('Failed to delete log', e) }
  }
  function openAddLog(log?: HabitLog) {
    setEditLog(log || null)
    setLogDate(log ? log.date : todayStr)
    setLogTime(log?.time || format(new Date(), 'HH:mm'))
    setLogNote(log?.note || '')
    setLogValue(log?.value?.toString() ?? '')
    setShowAddLog(true)
  }


  function openAddHabit() {
    if (overLimit) {
      const ok = window.confirm(
        `You already have ${currentHabits.length} active habits. ` +
        `Research suggests 1–3 habits at a time is optimal — focusing on fewer habits ` +
        `gives you a much better chance of sticking with them long-term.` +
        `\n\nAdd another anyway?`
      )
      if (!ok) return
    }
    setEditHabit(null)
    setName('')
    setKind('good')
    setColor(DEFAULT_COLOR)
    setArchivedAfterDays(settings.defaultArchiveDays)
    setShowModal(true)
  }

  function openAddPotential() {
    setEditHabit(null)
    setName('')
    setKind('good')
    setColor(DEFAULT_COLOR)
    setArchivedAfterDays(null)
    setShowModal(true)
  }
  function openEditHabit(habit: Habit) {
    setEditHabit(habit)
    setName(habit.name)
    setKind(habit.kind)
    setColor(habit.color)
    setArchivedAfterDays(habit.archivedAfterDays ?? null)
    setShowModal(true)
  }

  async function saveHabit() {
    if (!name.trim()) return
    try {
      if (editHabit) {
        await db.habits.update(editHabit.id, { name: name.trim(), kind, color, archivedAfterDays, updatedAt: isoNow() })
      } else {
        await db.habits.add({ id: uuid(), name: name.trim(), kind, color, archivedAfterDays, status: 'active', createdAt: isoNow(), updatedAt: isoNow() })
      }
      setShowModal(false)
      await loadData()
    } catch (e) { console.error('Failed to save habit', e) }
  }

  async function promoteHabit(id: string) {
    await db.habits.update(id, { status: 'active', updatedAt: isoNow() })
    await loadData()
  }

  async function demoteToPotential(id: string) {
    await db.habits.update(id, { status: 'potential', updatedAt: isoNow() })
    await loadData()
  }

  async function archiveHabitFn(id: string) {
    try {
      await db.habits.update(id, { archivedAt: isoNow(), updatedAt: isoNow() })
      if (selectedId === id) setSelectedId(null)
      setArchiveConfirm(null)
      await loadData()
    } catch (e) { console.error('Failed to archive habit', e) }
  }

  async function unarchiveHabitFn(id: string) {
    try {
      await db.habits.update(id, { archivedAt: null, updatedAt: isoNow() })
      await loadData()
    } catch (e) { console.error('Failed to unarchive habit', e) }
  }

  async function deleteHabitFn(id: string) {
    // Snapshot the habit and its logs before deleting
    const habit = await db.habits.get(id)
    const logs = await db.habitLogs.where('habitId').equals(id).toArray()
    if (!habit) return
    await db.habits.delete(id)
    await db.habitLogs.where('habitId').equals(id).delete()
    if (selectedId === id) setSelectedId(null)
    setDeleteConfirm(null)
    await loadData()
    pushUndo({
      description: `Deleted habit "${habit.name}"`,
      undo: async () => { await db.habits.put(habit); if (logs.length > 0) await db.habitLogs.bulkPut(logs); await loadData() },
      redo: async () => { await db.habits.delete(id); await db.habitLogs.where('habitId').equals(id).delete(); await loadData() },
    })
  }

  const calendarDays = useMemo(() => {
    const start = startOfMonth(calendarMonth)
    const end = endOfMonth(calendarMonth)
    return eachDayOfInterval({ start, end })
  }, [calendarMonth])

  const calendarStartDay = getDay(startOfMonth(calendarMonth))

  function HabitCard({ habit }: { habit: Habit }) {
    const isBad = habit.kind === 'bad'
    const streak = getStreak(habit.id)
    const todayCount = getTodayCount(habit.id)
    const daysLogged = getDaysLogged(habit.id)
    const archiveThreshold = habit.archivedAfterDays ?? settings.defaultArchiveDays
    const reachedThreshold = daysLogged >= archiveThreshold
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const d = subDays(new Date(), 6 - i)
      const ds = format(d, 'yyyy-MM-dd')
      const hasLog = data.habitLogs.some((l) => l.habitId === habit.id && l.date === ds)
      return { date: ds, hasLog }
    })
    const streakLabel = isBad
      ? (streak > 0 ? `✓ ${streak} day streak of avoiding` : 'No streak yet')
      : (streak > 0 ? `🔥 ${streak} day streak` : 'No streak yet')
    return (
      <Card
        className={cn('cursor-pointer transition-shadow hover:shadow-md', selectedId === habit.id && 'ring-2 ring-primary-500')}
        onClick={() => setSelectedId(habit.id === selectedId ? null : habit.id)}
      >
        <div className="flex items-center gap-3">
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: habit.color }} />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-800 dark:text-slate-100">{habit.name}</span>
              {isBad && (
                <span
                  className="cursor-help text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  title="For bad habits, the streak counts days you DIDN'T do it. Logging a bad habit means logging that you did the bad thing. The goal is to keep the streak growing."
                  aria-label="About bad habit streaks"
                >ⓘ</span>
              )}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              {streakLabel}
              <span className="mx-1">·</span>
              {daysLogged} {isBad ? 'lapses' : 'days logged'}
            </div>
          </div>
          {todayCount > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium dark:bg-slate-700">{todayCount} today</span>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between">
          <div className="flex gap-1">
            {last7.map((d) => (
              <div
                key={d.date}
                className={cn('h-2.5 w-2.5 rounded-full', d.hasLog ? '' : 'bg-slate-200 dark:bg-slate-700')}
                style={d.hasLog ? { backgroundColor: habit.color } : undefined}
                title={`${d.date}${isBad ? ' (lapse)' : ''}`}
              />
            ))}
          </div>
          <div className="flex gap-1">
            <Button variant="primary" size="sm" onClick={(e) => { e.stopPropagation(); quickLogToday(habit.id) }}>
              Quick Log
            </Button>
            <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); setSelectedId(habit.id); openAddLog() }}>
              {isBad ? 'Log lapse' : 'Log with note'}
            </Button>
          </div>
        </div>

        {/* Suggestion to archive for good habits only */}
        {!isBad && reachedThreshold && (
          <p className="mt-2 text-xs text-green-600 dark:text-green-400">
            🎉 {archiveThreshold} day{archiveThreshold === 1 ? '' : 's'} done — this habit may now be automatic. Consider{' '}
            <button
              onClick={(e) => { e.stopPropagation(); setArchiveConfirm(habit.id) }}
              className="underline hover:text-green-800"
            >archiving</button>.
          </p>
        )}

        <div className="mt-2 flex flex-wrap gap-1">
          <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); openEditHabit(habit) }}>Edit</Button>
          <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); demoteToPotential(habit.id) }} title="Move to potential list — pick this up later">Park</Button>
          <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); setArchiveConfirm(habit.id) }}>Archive</Button>
          <Button variant="danger" size="sm" onClick={(e) => { e.stopPropagation(); setDeleteConfirm(habit.id) }}>Delete</Button>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Habits</h2>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={openAddPotential}
            title="Add a habit you want to do later but can't take on right now"
          >
            + Park for later
          </Button>
          <Button variant="primary" size="sm" onClick={openAddHabit}>Add Habit</Button>
        </div>
      </div>

      {/* Inline explainer so the 'Park' feature is discoverable */}
      {currentHabits.length > 0 && potentialHabits.length === 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800/50 dark:bg-amber-900/20 dark:text-amber-200">
          <span className="text-lg leading-none">💡</span>
          <div className="flex-1">
            <strong>Got habits you can't take on right now?</strong> Hit "Park for later" to add them to your wishlist — they don't count toward your active limit and you can promote them whenever you've got room.
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-green-600 dark:text-green-400">Good Habits</h3>
        {goodHabits.length === 0 ? <EmptyState title="No good habits" description="Track positive habits you want to build." /> : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{goodHabits.map((h) => <HabitCard key={h.id} habit={h} />)}</div>
        )}
      </div>
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">Bad Habits</h3>
        {badHabits.length === 0 ? <EmptyState title="No bad habits" description="Track habits you want to avoid." /> : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{badHabits.map((h) => <HabitCard key={h.id} habit={h} />)}</div>
        )}
      </div>
      {potentialHabits.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">Potential Habits</h3>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            On the wishlist — pick these up when you've got room.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {potentialHabits.map((h) => (
              <Card key={h.id} className="opacity-80">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: h.color }} />
                  <div className="flex-1 font-medium text-slate-700 dark:text-slate-200">{h.name}</div>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                    {h.kind === 'good' ? 'Good' : 'Bad'}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  <Button variant="primary" size="sm" onClick={() => promoteHabit(h.id)}>Promote</Button>
                  <Button variant="secondary" size="sm" onClick={() => openEditHabit(h)}>Edit</Button>
                  <Button variant="danger" size="sm" onClick={() => setDeleteConfirm(h.id)}>Delete</Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {archivedHabits.length > 0 && (
        <div>
          <button className="text-sm font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? 'Hide' : 'Show'} Archived Habits ({archivedHabits.length})
          </button>
          {showArchived && (
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {archivedHabits.map((h) => (
                <Card key={h.id} className="opacity-75">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-slate-700 dark:text-slate-300">{h.name} (Archived)</div>
                    <Button variant="secondary" size="sm" onClick={() => unarchiveHabitFn(h.id)}>Restore</Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedHabit && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                <span className="mr-2 inline-block h-3 w-3 rounded-full" style={{ backgroundColor: selectedHabit.color }} />
                {selectedHabit.name}
              </CardTitle>
              <span className={cn('rounded px-2 py-0.5 text-xs font-medium', selectedHabit.kind === 'good' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>
                {selectedHabit.kind === 'good' ? 'Good' : 'Bad'}
              </span>
            </div>
          </CardHeader>

          <div className="mb-4 flex gap-4 text-sm text-slate-600">
            <div><span className="font-semibold">{getStreak(selectedHabit.id)}</span> day streak</div>
            <div><span className="font-semibold">{selectedHabitLogs.length}</span> total logs</div>
          </div>

          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <button onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700">←</button>
              <span className="font-medium">{format(calendarMonth, 'MMMM yyyy')}</span>
              <button onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700">→</button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs">
              {WEEKDAYS.map((day) => <div key={day} className="py-1 font-medium text-slate-500">{day}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: calendarStartDay }).map((_, i) => <div key={`empty-${i}`} />)}
              {calendarDays.map((day) => {
                const dateStr = format(day, 'yyyy-MM-dd')
                const dayLogs = logsByDate[dateStr] ?? []
                const count = dayLogs.length
                const totalValue = dayLogs.reduce((sum, l) => sum + (l.value ?? 0), 0)
                // Adaptive thresholds: 5 levels (0, 1, 2, 3, 4) using per-habit history
                const target = selectedHabit.targetPerDay ?? 1
                const intensity = count === 0
                  ? 0
                  : count >= target * 4
                  ? 4
                  : count >= target * 2
                  ? 3
                  : count >= target
                  ? 2
                  : 1
                const opacity = intensity === 0 ? undefined : 0.2 + (intensity * 0.2)
                return (
                  <button
                    key={dateStr}
                    onClick={() => setDayDetailDate(dateStr)}
                    title={totalValue > 0 ? `${dateStr} — ${count} log${count !== 1 ? 's' : ''} (${totalValue} total)` : `${dateStr}${count > 0 ? ` — ${count} log${count !== 1 ? 's' : ''}` : ''}`}
                    className={cn(
                      'flex h-9 w-full flex-col items-center justify-center rounded text-xs font-medium transition-all hover:ring-2 hover:ring-primary-400',
                      intensity === 0 && 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700',
                      intensity > 0 && 'text-white shadow-sm'
                    )}
                    style={intensity > 0 ? { backgroundColor: selectedHabit.color, opacity } : undefined}
                  >
                    <span>{format(day, 'd')}</span>
                    {count > 0 && <span className="text-[9px] opacity-90">×{count}{totalValue > 0 ? ` ${totalValue}` : ''}</span>}
                  </button>
                )
              })}
            </div>
            {/* Heatmap legend — 5 levels */}
            <div className="mt-2 flex items-center justify-end gap-1 text-xs text-slate-500">
              <span>less</span>
              <div className="h-3 w-3 rounded bg-slate-100 dark:bg-slate-800" />
              <div className="h-3 w-3 rounded" style={{ backgroundColor: selectedHabit.color, opacity: 0.2 }} />
              <div className="h-3 w-3 rounded" style={{ backgroundColor: selectedHabit.color, opacity: 0.4 }} />
              <div className="h-3 w-3 rounded" style={{ backgroundColor: selectedHabit.color, opacity: 0.6 }} />
              <div className="h-3 w-3 rounded" style={{ backgroundColor: selectedHabit.color, opacity: 0.8 }} />
              <div className="h-3 w-3 rounded" style={{ backgroundColor: selectedHabit.color, opacity: 1 }} />
              <span>more</span>
            </div>
          </div>
          <div className="mb-4">
            <Button variant="secondary" onClick={() => openAddLog()}>+ Add Log</Button>
          </div>
        </Card>
      )}


      <Modal open={showModal} onClose={() => setShowModal(false)} title={editHabit ? 'Edit Habit' : 'Add Habit'}>
        <div className="space-y-3">
          <input className="input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as Habit['kind'])}>
            <option value="good">Good</option>
            <option value="bad">Bad</option>
          </select>
          <ColorPicker value={color} onChange={setColor} />
          <Button variant="primary" className="w-full" onClick={saveHabit}>{editHabit ? 'Save' : 'Add'}</Button>
        </div>
      </Modal>

      <Modal open={showAddLog} onClose={() => setShowAddLog(false)} title={editLog ? 'Edit Log' : 'Add Log'}>
        <div className="space-y-3">
          <input type="date" className="input" max={todayStr} value={logDate} onChange={(e) => setLogDate(e.target.value)} />
          <input type="time" className="input" value={logTime} onChange={(e) => setLogTime(e.target.value)} />
          <input
            type="number"
            className="input"
            placeholder="Amount (optional, e.g. 15 for 15 minutes)"
            min={0}
            value={logValue}
            onChange={(e) => setLogValue(e.target.value)}
          />
          <textarea className="input" placeholder="Note (e.g. what happened, how you felt)" rows={3} value={logNote} onChange={(e) => setLogNote(e.target.value)} />
          <Button variant="primary" className="w-full" onClick={saveLog}>Save</Button>
        </div>
      </Modal>

      <Modal open={dayDetailDate !== null} onClose={() => setDayDetailDate(null)} title={dayDetailDate ? format(parseISO(dayDetailDate), 'EEEE, MMM d, yyyy') : ''}>
        <div className="space-y-3">
          {dayDetailDate && logsByDate[dayDetailDate]?.length > 0 ? (
            logsByDate[dayDetailDate].map(log => (
              <div key={log.id} className="flex items-start justify-between gap-2 rounded bg-slate-50 p-2 text-sm dark:bg-slate-700">
                <div className="flex-1">
                  {log.time && <span className="mr-2 font-mono font-medium text-slate-600 dark:text-slate-300">{log.time}</span>}
                  {log.note ? <span className="text-slate-800 dark:text-slate-100">{log.note}</span> : <span className="text-slate-400 italic dark:text-slate-500">(no note)</span>}
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => { setDayDetailDate(null); openAddLog(log) }}
                    className="text-xs text-primary-600 hover:text-primary-800 dark:text-primary-400"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteLog(log)}
                    className="text-xs text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">No logs for this day.</p>
          )}
        </div>
      </Modal>

      <Modal open={deleteConfirm !== null} onClose={() => setDeleteConfirm(null)} title="Delete Habit?">
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            This will delete the habit and all its logs. You can undo with Ctrl+Z.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="danger" className="flex-1" onClick={() => deleteConfirm && deleteHabitFn(deleteConfirm)}>Delete</Button>
          </div>
        </div>
      </Modal>

      <Modal open={archiveConfirm !== null} onClose={() => setArchiveConfirm(null)} title="Archive Habit?">
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Archive this habit? You can always restore it later from the archived list.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setArchiveConfirm(null)}>Cancel</Button>
            <Button variant="primary" className="flex-1" onClick={() => archiveConfirm && archiveHabitFn(archiveConfirm)}>Archive</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
