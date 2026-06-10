import { useState } from 'react'
import { format, subDays } from 'date-fns'
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
import type { Habit } from '../../domain/types'

const DEFAULT_COLOR = '#6366f1'

export default function HabitsPage() {
  const { data, isLoading, loadData } = useData()
  const [showModal, setShowModal] = useState(false)
  const [editHabit, setEditHabit] = useState<Habit | null>(null)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<Habit['kind']>('good')
  const [color, setColor] = useState(DEFAULT_COLOR)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  if (isLoading) return <PageSpinner />

  const goodHabits = data.habits.filter((h) => h.kind === 'good')
  const badHabits = data.habits.filter((h) => h.kind === 'bad')

  const selectedHabit = data.habits.find((h) => h.id === selectedId) ?? null
  const selectedLogs = selectedHabit
    ? new Set(data.habitLogs.filter((l) => l.habitId === selectedId).map((l) => l.date))
    : new Set<string>()

  const todayStr = format(new Date(), 'yyyy-MM-dd')

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

  function isLoggedToday(habitId: string): boolean {
    return data.habitLogs.some((l) => l.habitId === habitId && l.date === todayStr)
  }

  async function toggleToday(habitId: string) {
    const existing = data.habitLogs.find((l) => l.habitId === habitId && l.date === todayStr)
    if (existing) {
      await db.habitLogs.delete(existing.id)
    } else {
      await db.habitLogs.add({
        id: uuid(),
        habitId,
        date: todayStr,
        createdAt: isoNow(),
        updatedAt: isoNow(),
      })
    }
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

  async function deleteHabit(id: string) {
    await db.habits.delete(id)
    await db.habitLogs.where('habitId').equals(id).delete()
    if (selectedId === id) setSelectedId(null)
    setDeleteConfirm(null)
    await loadData()
  }

  const heatmapDays = Array.from({ length: 90 }, (_, i) => {
    const d = subDays(new Date(), 89 - i)
    return format(d, 'yyyy-MM-dd')
  })

  function HabitCard({ habit }: { habit: Habit }) {
    const streak = getStreak(habit.id)
    const logged = isLoggedToday(habit.id)
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
          <button
            onClick={(e) => { e.stopPropagation(); toggleToday(habit.id) }}
            className={cn(
              'h-6 w-6 rounded-full border-2 transition-colors',
              logged
                ? 'border-transparent'
                : 'border-slate-300 dark:border-slate-600'
            )}
            style={logged ? { backgroundColor: habit.color } : undefined}
            title={logged ? 'Unlog today' : 'Log today'}
          />
        </div>
        <div className="mt-2 flex gap-1">
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

      {selectedHabit && (
        <Card>
          <CardHeader>
            <CardTitle>
              <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: selectedHabit.color }} />
              {selectedHabit.name} — Last 90 Days
            </CardTitle>
          </CardHeader>
          <div className="flex flex-wrap gap-1">
            {heatmapDays.map((d) => {
              const logged = selectedLogs.has(d)
              return (
                <div
                  key={d}
                  className={cn(
                    'h-3 w-3 rounded-sm transition-colors',
                    !logged && 'bg-slate-200 dark:bg-slate-700'
                  )}
                  style={logged ? { backgroundColor: selectedHabit.color } : undefined}
                  title={`${d}${logged ? ' ✓' : ''}`}
                />
              )
            })}
          </div>
        </Card>
      )}

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

      <Modal open={deleteConfirm !== null} onClose={() => setDeleteConfirm(null)} title="Delete Habit?">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          This will delete the habit and all its logs.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => deleteConfirm && deleteHabit(deleteConfirm)}>Delete</Button>
        </div>
      </Modal>
    </div>
  )
}
