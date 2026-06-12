import { useState, useMemo } from 'react'
import { format, subDays, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, parseISO } from 'date-fns'
import { useData } from '../../app/providers'
import { db } from '../../db/app-db'
import { cn, isoNow } from '../../lib/utils'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader, CardTitle } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { PageSpinner } from '../../components/ui/Spinner'
import { ColorPicker } from '../../components/ui/ColorPicker'
import { v4 as uuid } from 'uuid'
import type { Habit, HabitLog } from '../../domain/types'

const DEFAULT_COLOR = '#6366f1'
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function HabitsPage() {
  const { data, isLoading, loadData } = useData()
  const [showModal, setShowModal] = useState(false)
  const [editHabit, setEditHabit] = useState<Habit | null>(null)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<Habit['kind']>('good')
  const [color, setColor] = useState(DEFAULT_COLOR)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  
  const [showAddLog, setShowAddLog] = useState(false)
  const [logDate, setLogDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [logTime, setLogTime] = useState('')
  const [logNote, setLogNote] = useState('')
  const [editLog, setEditLog] = useState<HabitLog | null>(null)
  
  const [calendarMonth, setCalendarMonth] = useState(new Date())

  if (isLoading) return <PageSpinner />

  const goodHabits = data.habits.filter((h) => h.kind === 'good')
  const badHabits = data.habits.filter((h) => h.kind === 'bad')
  const selectedHabit = data.habits.find((h) => h.id === selectedId) ?? null
  const todayStr = format(new Date(), 'yyyy-MM-dd')

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

  const logsByDate = useMemo(() => {
    const groups: Record<string, HabitLog[]> = {}
    selectedHabitLogs.forEach((log) => {
      if (!groups[log.date]) groups[log.date] = []
      groups[log.date].push(log)
    })
    return groups
  }, [selectedHabitLogs])

  const logsPerDay = useMemo(() => {
    const map: Record<string, number> = {}
    selectedHabitLogs.forEach((log) => {
      map[log.date] = (map[log.date] || 0) + 1
    })
    return map
  }, [selectedHabitLogs])

  function getStreak(habitId: string): number {
    const logDates = new Set(data.habitLogs.filter((l) => l.habitId === habitId).map((l) => l.date))
    let streak = 0
    let d = new Date()
    while (true) {
      const ds = format(d, 'yyyy-MM-dd')
      if (logDates.has(ds)) {
        streak++
        d = subDays(d, 1)
      } else { break }
    }
    return streak
  }

  function getTodayCount(habitId: string): number {
    return data.habitLogs.filter((l) => l.habitId === habitId && l.date === todayStr).length
  }

  async function quickLogToday(habitId: string) {
    try {
      await db.habitLogs.add({
        id: uuid(),
        habitId,
        date: todayStr,
        createdAt: isoNow(),
        updatedAt: isoNow(),
      })
      await loadData()
    } catch (e) { console.error('Failed to quick log', e) }
  }

  async function saveLog() {
    if (!selectedId) return
    try {
      if (editLog) {
        await db.habitLogs.update(editLog.id, {
          date: logDate,
          time: logTime || undefined,
          note: logNote.trim() || undefined,
          updatedAt: isoNow(),
        })
      } else {
        await db.habitLogs.add({
          id: uuid(),
          habitId: selectedId,
          date: logDate,
          time: logTime || undefined,
          note: logNote.trim() || undefined,
          createdAt: isoNow(),
          updatedAt: isoNow(),
        })
      }
      await loadData()
      setShowAddLog(false)
      setEditLog(null)
    } catch (e) { console.error('Failed to save log', e) }
  }

  async function deleteLog(logId: string) {
    try {
      await db.habitLogs.delete(logId)
      await loadData()
    } catch (e) { console.error('Failed to delete log', e) }
  }

  function openAddLog(log?: HabitLog) {
    setEditLog(log || null)
    setLogDate(log ? log.date : todayStr)
    setLogTime(log?.time || '')
    setLogNote(log?.note || '')
    setShowAddLog(true)
  }

  function openAddHabit() {
    setEditHabit(null)
    setName('')
    setKind('good')
    setColor(DEFAULT_COLOR)
    setShowModal(true)
  }

  function openEditHabit(habit: Habit) {
    setEditHabit(habit)
    setName(habit.name)
    setKind(habit.kind)
    setColor(habit.color)
    setShowModal(true)
  }

  async function saveHabit() {
    if (!name.trim()) return
    try {
      if (editHabit) {
        await db.habits.update(editHabit.id, { name: name.trim(), kind, color, updatedAt: isoNow() })
      } else {
        await db.habits.add({ id: uuid(), name: name.trim(), kind, color, createdAt: isoNow(), updatedAt: isoNow() })
      }
      setShowModal(false)
      await loadData()
    } catch (e) { console.error('Failed to save habit', e) }
  }

  async function deleteHabitFn(id: string) {
    try {
      await db.habits.delete(id)
      await db.habitLogs.where('habitId').equals(id).delete()
      if (selectedId === id) setSelectedId(null)
      setDeleteConfirm(null)
      await loadData()
    } catch (e) { console.error('Failed to delete habit', e) }
  }

  const calendarDays = useMemo(() => {
    const start = startOfMonth(calendarMonth)
    const end = endOfMonth(calendarMonth)
    return eachDayOfInterval({ start, end })
  }, [calendarMonth])

  const calendarStartDay = getDay(startOfMonth(calendarMonth))

  function HabitCard({ habit }: { habit: Habit }) {
    const streak = getStreak(habit.id)
    const todayCount = getTodayCount(habit.id)
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const d = subDays(new Date(), 6 - i)
      const ds = format(d, 'yyyy-MM-dd')
      const hasLog = data.habitLogs.some((l) => l.habitId === habit.id && l.date === ds)
      return { date: ds, hasLog }
    })
    return (
      <Card
        className={cn('cursor-pointer transition-shadow hover:shadow-md', selectedId === habit.id && 'ring-2 ring-primary-500')}
        onClick={() => setSelectedId(habit.id === selectedId ? null : habit.id)}
      >
        <div className="flex items-center gap-3">
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: habit.color }} />
          <div className="flex-1">
            <div className="font-medium text-slate-800 dark:text-slate-100">{habit.name}</div>
            <div className="mt-0.5 text-xs text-slate-500">{streak > 0 ? `🔥 ${streak} day streak` : 'No streak yet'}</div>
          </div>
          {todayCount > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium dark:bg-slate-700">{todayCount} today</span>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between">
          <div className="flex gap-1">
            {last7.map((d) => (
              <div key={d.date} className={cn('h-2.5 w-2.5 rounded-full', d.hasLog ? '' : 'bg-slate-200 dark:bg-slate-700')} style={d.hasLog ? { backgroundColor: habit.color } : undefined} title={d.date} />
            ))}
          </div>
          <Button variant="primary" size="sm" onClick={(e) => { e.stopPropagation(); quickLogToday(habit.id) }}>+ Log</Button>
        </div>
        <div className="mt-2 flex gap-1">
          <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); openEditHabit(habit) }}>Edit</Button>
          <Button variant="danger" size="sm" onClick={(e) => { e.stopPropagation(); setDeleteConfirm(habit.id) }}>Delete</Button>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Habits</h2>
        <Button variant="primary" size="sm" onClick={openAddHabit}>Add Habit</Button>
      </div>

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
              <button onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))} className="rounded p-1 hover:bg-slate-100">←</button>
              <span className="font-medium">{format(calendarMonth, 'MMMM yyyy')}</span>
              <button onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))} className="rounded p-1 hover:bg-slate-100">→</button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs">
              {WEEKDAYS.map((day) => <div key={day} className="py-1 font-medium text-slate-500">{day}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: calendarStartDay }).map((_, i) => <div key={`empty-${i}`} />)}
              {calendarDays.map((day) => {
                const dateStr = format(day, 'yyyy-MM-dd')
                const count = logsPerDay[dateStr] || 0
                return (
                  <div key={dateStr} className="flex h-7 w-7 items-center justify-center rounded text-xs" style={{ backgroundColor: count > 0 ? selectedHabit.color : undefined, opacity: count > 0 ? (count === 1 ? 0.4 : count === 2 ? 0.7 : 1) : undefined }}>
                    <span className={cn(count > 0 ? 'text-white' : 'text-slate-500')}>{format(day, 'd')}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="mb-4">
            <Button variant="secondary" onClick={() => openAddLog()}>+ Add Log</Button>
          </div>

          {selectedHabitLogs.length === 0 ? <p className="text-sm text-slate-500">No logs yet.</p> : (
            <div className="space-y-3">
              {Object.entries(logsByDate).map(([date, logs]) => (
                <div key={date}>
                  <div className="mb-1 text-sm font-medium text-slate-600">{format(parseISO(date), 'EEEE, MMM d')} — {logs.length} log(s)</div>
                  <div className="space-y-1">
                    {logs.map((log) => (
                      <div key={log.id} className="flex items-center justify-between rounded bg-slate-50 p-2">
                        <div className="flex-1 text-sm">{log.time && <span className="mr-2 font-mono">{log.time}</span>}{log.note || '(no note)'}</div>
                        <div className="flex gap-1">
                          <Button variant="secondary" size="sm" onClick={() => openAddLog(log)}>Edit</Button>
                          <Button variant="danger" size="sm" onClick={() => deleteLog(log.id)}>×</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editHabit ? 'Edit Habit' : 'Add Habit'}>
        <div className="space-y-3">
          <input className="input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as Habit['kind'])}>
            <option value="good">Good</option><option value="bad">Bad</option>
          </select>
          <ColorPicker value={color} onChange={setColor} />
          <Button variant="primary" className="w-full" onClick={saveHabit}>{editHabit ? 'Save' : 'Add'}</Button>
        </div>
      </Modal>

      <Modal open={showAddLog} onClose={() => setShowAddLog(false)} title={editLog ? 'Edit Log' : 'Add Log'}>
        <div className="space-y-3">
          <input type="date" className="input" max={todayStr} value={logDate} onChange={(e) => setLogDate(e.target.value)} />
          <input type="time" className="input" value={logTime} onChange={(e) => setLogTime(e.target.value)} />
          <textarea className="input" placeholder="Note" value={logNote} onChange={(e) => setLogNote(e.target.value)} />
          <Button variant="primary" className="w-full" onClick={saveLog}>Save</Button>
        </div>
      </Modal>

      <Modal open={deleteConfirm !== null} onClose={() => setDeleteConfirm(null)} title="Delete?">
        <Button variant="danger" onClick={() => deleteConfirm && deleteHabitFn(deleteConfirm)}>Confirm Delete</Button>
      </Modal>
    </div>
  )
}
