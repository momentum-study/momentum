import { useState, useMemo } from 'react'
import { format, subDays, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isToday, parseISO } from 'date-fns'
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
  
  // Add log modal state
  const [showAddLog, setShowAddLog] = useState(false)
  const [logTime, setLogTime] = useState('')
  const [logNote, setLogNote] = useState('')
  
  // Calendar navigation
  const [calendarMonth, setCalendarMonth] = useState(new Date())

  if (isLoading) return <PageSpinner />

  const goodHabits = data.habits.filter((h) => h.kind === 'good')
  const badHabits = data.habits.filter((h) => h.kind === 'bad')

  const selectedHabit = data.habits.find((h) => h.id === selectedId) ?? null
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const nowTime = format(new Date(), 'HH:mm')

  // Get logs for selected habit
  const selectedHabitLogs = useMemo(() => {
    if (!selectedId) return []
    return data.habitLogs
      .filter((l) => l.habitId === selectedId)
      .sort((a, b) => {
        // Sort by date desc, then time desc
        const dateCmp = b.date.localeCompare(a.date)
        if (dateCmp !== 0) return dateCmp
        return (b.time || '').localeCompare(a.time || '')
      })
  }, [data.habitLogs, selectedId])

  // Group logs by date for the list
  const logsByDate = useMemo(() => {
    const groups: Record<string, HabitLog[]> = {}
    selectedHabitLogs.forEach((log) => {
      if (!groups[log.date]) groups[log.date] = []
      groups[log.date].push(log)
    })
    return groups
  }, [selectedHabitLogs])

  // Get logs per day for calendar
  const logsPerDay = useMemo(() => {
    const map: Record<string, number> = {}
    selectedHabitLogs.forEach((log) => {
      map[log.date] = (map[log.date] || 0) + 1
    })
    return map
  }, [selectedHabitLogs])

  function getStreak(habitId: string): number {
    const logDates = new Set(
      data.habitLogs.filter((l) => l.habitId === habitId).map((l) => l.date)
    )
    let streak = 0
    let d = new Date()
    while (true) {
      const ds = format(d, 'yyyy-MM-dd')
      if (logDates.has(ds)) {
        streak++
        d = subDays(d, 1)
      } else {
        break
      }
    }
    return streak
  }

  function getTodayCount(habitId: string): number {
    return data.habitLogs.filter((l) => l.habitId === habitId && l.date === todayStr).length
  }

  async function quickLogToday(habitId: string) {
    await db.habitLogs.add({
      id: uuid(),
      habitId,
      date: todayStr,
      time: '',
      createdAt: isoNow(),
      updatedAt: isoNow(),
    })
    await loadData()
  }

  async function addLogWithDetails() {
    if (!selectedId) return
    await db.habitLogs.add({
      id: uuid(),
      habitId: selectedId,
      date: todayStr,
      time: logTime || undefined,
      note: logNote.trim() || undefined,
      createdAt: isoNow(),
      updatedAt: isoNow(),
    })
    await loadData()
    setLogTime('')
    setLogNote('')
    setShowAddLog(false)
  }

  async function deleteLog(logId: string) {
    await db.habitLogs.delete(logId)
    await loadData()
  }

  function openAdd() {
    setEditHabit(null)
    setName('')
    setKind('good')
    setColor(DEFAULT_COLOR)
    setShowModal(true)
  }

  function openEdit(habit: Habit) {
    setEditHabit(habit)
    setName(habit.name)
    setKind(habit.kind)
    setColor(habit.color)
    setShowModal(true)
  }

  async function saveHabit() {
    if (!name.trim()) return
    if (editHabit) {
      await db.habits.update(editHabit.id, { name: name.trim(), kind, color, updatedAt: isoNow() })
    } else {
      await db.habits.add({
        id: uuid(),
        name: name.trim(),
        kind,
        color,
        createdAt: isoNow(),
        updatedAt: isoNow(),
      })
    }
    setShowModal(false)
    await loadData()
  }

  async function deleteHabitFn(id: string) {
    await db.habits.delete(id)
    await db.habitLogs.where('habitId').equals(id).delete()
    if (selectedId === id) setSelectedId(null)
    setDeleteConfirm(null)
    await loadData()
  }

  function openLogModal() {
    setLogTime(nowTime)
    setLogNote('')
    setShowAddLog(true)
  }

  // Calendar helpers
  const calendarDays = useMemo(() => {
    const start = startOfMonth(calendarMonth)
    const end = endOfMonth(calendarMonth)
    return eachDayOfInterval({ start, end })
  }, [calendarMonth])

  const calendarStartDay = getDay(startOfMonth(calendarMonth))

  function getOpacityForCount(count: number): number {
    if (count === 0) return 0
    if (count === 1) return 0.4
    if (count === 2) return 0.7
    return 1
  }

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
        className={cn(
          'cursor-pointer transition-shadow hover:shadow-md',
          selectedId === habit.id && 'ring-2 ring-primary-500'
        )}
        onClick={() => setSelectedId(habit.id === selectedId ? null : habit.id)}
      >
        <div className="flex items-center gap-3">
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: habit.color }} />
          <div className="flex-1">
            <div className="font-medium text-slate-800 dark:text-slate-100">{habit.name}</div>
            <div className="mt-0.5 text-xs text-slate-500">
              {streak > 0 ? `🔥 ${streak} day streak` : 'No streak yet'}
            </div>
          </div>
          {todayCount > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium dark:bg-slate-700">
              {todayCount} today
            </span>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between">
          <div className="flex gap-1">
            {last7.map((d) => (
              <div
                key={d.date}
                className={cn(
                  'h-2.5 w-2.5 rounded-full',
                  d.hasLog ? '' : 'bg-slate-200 dark:bg-slate-700'
                )}
                style={d.hasLog ? { backgroundColor: habit.color } : undefined}
                title={d.date}
              />
            ))}
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              quickLogToday(habit.id)
            }}
          >
            + Log
          </Button>
        </div>
        <div className="mt-2 flex gap-1">
          <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); openEdit(habit) }}>
            Edit
          </Button>
          <Button variant="danger" size="sm" onClick={(e) => { e.stopPropagation(); setDeleteConfirm(habit.id) }}>
            Delete
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Habits</h2>
        <Button variant="primary" size="sm" onClick={openAdd}>Add Habit</Button>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-green-600 dark:text-green-400">
          Good Habits
        </h3>
        {goodHabits.length === 0 ? (
          <EmptyState title="No good habits" description="Track positive habits you want to build." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {goodHabits.map((h) => <HabitCard key={h.id} habit={h} />)}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
          Bad Habits
        </h3>
        {badHabits.length === 0 ? (
          <EmptyState title="No bad habits" description="Track habits you want to avoid." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {badHabits.map((h) => <HabitCard key={h.id} habit={h} />)}
          </div>
        )}
      </div>

      {/* Detail View */}
      {selectedHabit && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                <span className="mr-2 inline-block h-3 w-3 rounded-full" style={{ backgroundColor: selectedHabit.color }} />
                {selectedHabit.name}
              </CardTitle>
              <span className={cn(
                'rounded px-2 py-0.5 text-xs font-medium',
                selectedHabit.kind === 'good' 
                  ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                  : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
              )}>
                {selectedHabit.kind === 'good' ? 'Good' : 'Bad'}
              </span>
            </div>
          </CardHeader>
          
          <div className="mb-4 flex gap-4 text-sm text-slate-600 dark:text-slate-400">
            <div>
              <span className="font-semibold">{getStreak(selectedHabit.id)}</span> day streak
            </div>
            <div>
              <span className="font-semibold">{selectedHabitLogs.length}</span> total logs
            </div>
          </div>

          {/* Calendar */}
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <button
                onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))}
                className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                ←
              </button>
              <span className="font-medium">{format(calendarMonth, 'MMMM yyyy')}</span>
              <button
                onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))}
                className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                →
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs">
              {WEEKDAYS.map((day) => (
                <div key={day} className="py-1 font-medium text-slate-500">{day}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: calendarStartDay }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}
              {calendarDays.map((day) => {
                const dateStr = format(day, 'yyyy-MM-dd')
                const count = logsPerDay[dateStr] || 0
                const isTodayDate = isToday(day)
                const opacity = getOpacityForCount(count)
                return (
                  <div
                    key={dateStr}
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded text-xs',
                      isTodayDate && 'ring-2 ring-primary-500'
                    )}
                    style={{
                      backgroundColor: count > 0 ? selectedHabit.color : undefined,
                      opacity: count > 0 ? opacity : undefined,
                    }}
                    title={`${dateStr}: ${count} log${count !== 1 ? 's' : ''}`}
                  >
                    <span className={cn(
                      count > 0 ? 'text-white' : 'text-slate-500 dark:text-slate-400'
                    )}>
                      {format(day, 'd')}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Add Log Button */}
          <div className="mb-4">
            <Button variant="secondary" onClick={openLogModal}>
              + Add Log
            </Button>
          </div>

          {/* Log List */}
          {selectedHabitLogs.length === 0 ? (
            <p className="text-sm text-slate-500">No logs yet. Click "+ Log" to record.</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(logsByDate).map(([date, logs]) => (
                <div key={date}>
                  <div className="mb-1 text-sm font-medium text-slate-600 dark:text-slate-400">
                    {format(parseISO(date), 'EEEE, MMM d')} — {logs.length} log{logs.length !== 1 ? 's' : ''}
                  </div>
                  <div className="space-y-1">
                    {logs.map((log) => (
                      <div
                        key={log.id}
                        className="flex items-center justify-between rounded bg-slate-50 p-2 dark:bg-slate-700/50"
                      >
                        <div className="flex-1">
                          {log.time && (
                            <span className="mr-2 font-mono text-sm">{log.time}</span>
                          )}
                          <span className="text-sm text-slate-700 dark:text-slate-300">
                            {log.note || '(no note)'}
                          </span>
                        </div>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => deleteLog(log.id)}
                        >
                          ×
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Add/Edit Habit Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editHabit ? 'Edit Habit' : 'Add Habit'}>
        <div className="space-y-3">
          <div>
            <label className="label">Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">Kind</label>
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value as Habit['kind'])}>
              <option value="good">Good</option>
              <option value="bad">Bad</option>
            </select>
          </div>
          <div>
            <label className="label">Color</label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
          <Button variant="primary" className="w-full" onClick={saveHabit}>
            {editHabit ? 'Save' : 'Add'}
          </Button>
        </div>
      </Modal>

      {/* Add Log Modal */}
      <Modal open={showAddLog} onClose={() => setShowAddLog(false)} title="Add Log">
        <div className="space-y-3">
          <div>
            <label className="label">Time (optional)</label>
            <input
              type="time"
              className="input"
              value={logTime}
              onChange={(e) => setLogTime(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Note (optional)</label>
            <textarea
              className="input min-h-[60px]"
              rows={2}
              value={logNote}
              onChange={(e) => setLogNote(e.target.value)}
              placeholder="How did it go?"
            />
          </div>
          <Button variant="primary" className="w-full" onClick={addLogWithDetails}>
            Log
          </Button>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal open={deleteConfirm !== null} onClose={() => setDeleteConfirm(null)} title="Delete Habit?">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          This will delete the habit and all its logs.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => deleteConfirm && deleteHabitFn(deleteConfirm)}>Delete</Button>
        </div>
      </Modal>
    </div>
  )
}