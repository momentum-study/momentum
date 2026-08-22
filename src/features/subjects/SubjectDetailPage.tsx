import { useMemo, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { format, subDays } from 'date-fns'
import { useData } from '../../app/providers'
import { db } from '../../db/app-db'
import { cn, formatMinutes, isoNow, toLocalDateString, getChildSubjects, softDelete } from '../../lib/utils'
import { revertRoutineLogsForSession, updateRoutineLogsForSession, revertStreakDayForSession, recomputeStreakDaysForDates } from '../../lib/routine-tracker'
import { loadSettings } from '../../lib/settings-store'
import { useUndo } from '../../lib/use-undo'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader, CardTitle } from '../../components/ui/Card'
import { ColorPicker, COLOR_NAMES } from '../../components/ui/ColorPicker'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { PageSpinner } from '../../components/ui/Spinner'
import { KebabMenu } from '../../components/ui/KebabMenu'
import { SessionDetailsModal } from '../../components/ui/SessionDetailsModal'
import type { Session } from '../../domain/types'

/** Tooltip text for a subject's color dot: preset name, or hex, or fallback. */
function colorName(hex: string): string {
  return COLOR_NAMES[hex] ?? (hex || 'Color')
}
const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DEFAULT_COLOR = '#6366f1'
// ── Period helpers ──

function startOfDay(d: Date) {
  const c = new Date(d); c.setHours(0, 0, 0, 0); return c
}
function periodStart(period: 'week' | 'month' | 'quarter' | 'all'): Date {
  if (period === 'week') return subDays(startOfDay(new Date()), 6) // last 7 days incl today
  if (period === 'month') return subDays(startOfDay(new Date()), 29)
  if (period === 'quarter') return subDays(startOfDay(new Date()), 89)
  return new Date(0) // all time
}

function filterSessions(sessions: Session[], period: 'week' | 'month' | 'quarter' | 'all'): Session[] {
  const start = periodStart(period)
  return sessions.filter((s) => new Date(s.startAt) >= start)
}

function sumMinutes(sessions: Session[]): number {
  return sessions.reduce((sum, s) => sum + s.durationMinutes, 0)
}

// ── Component ──

interface FormData {
  name: string
  categoryId: string
  color: string
  parentSubjectId: string
  routine: number[]
  weeklyTargetMinutes: number
}
const emptyFormData: FormData = { name: '', categoryId: '', color: DEFAULT_COLOR, parentSubjectId: '', routine: [], weeklyTargetMinutes: 60 }

export default function SubjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data, isLoading, loadData, mutate } = useData()
  const { push: pushUndo } = useUndo()
  const settings = useMemo(() => loadSettings(), [])

  // ── Data derivation ──
  const subject = useMemo(() => data.subjects.find((s) => s.id === id), [data.subjects, id])
  const category = useMemo(
    () => subject ? data.categories.find((c) => c.id === subject.categoryId) : undefined,
    [data.categories, subject]
  )
  const parent = useMemo(
    () => subject?.parentSubjectId ? data.subjects.find((s) => s.id === subject.parentSubjectId) : undefined,
    [data.subjects, subject]
  )

  // All non-deleted sessions for this subject (includes children via manual filter)
  const subjectIds = useMemo(() => {
    if (!subject) return new Set<string>()
    const ids = new Set([subject.id])
    for (const s of data.subjects) {
      if (!s.deletedAt && s.parentSubjectId === subject.id) ids.add(s.id)
    }
    return ids
  }, [subject, data.subjects])

  const sessions = useMemo(
    () => data.sessions
      .filter((s) => !s.deletedAt && subjectIds.has(s.subjectId))
      .sort((a, b) => b.startAt.localeCompare(a.startAt)),
    [data.sessions, subjectIds]
  )

  // ── Stats ──
  const todayStr = toLocalDateString(new Date().toISOString())
  const todaySessions = useMemo(() => sessions.filter((s) => toLocalDateString(s.startAt) === todayStr), [sessions, todayStr])
  const weekSessions = useMemo(() => filterSessions(sessions, 'week'), [sessions])
  const monthSessions = useMemo(() => filterSessions(sessions, 'month'), [sessions])

  const weekMinutes = useMemo(() => sumMinutes(weekSessions), [weekSessions])
  const monthMinutes = useMemo(() => sumMinutes(monthSessions), [monthSessions])
  const totalMinutes = useMemo(() => sumMinutes(sessions), [sessions])

  // Subject-specific daily target: weeklyTargetMinutes / 7 if set, else global
  const dailyTarget = useMemo(() => {
    if (subject?.weeklyTargetMinutes && subject.weeklyTargetMinutes > 0) {
      return Math.max(1, Math.round(subject.weeklyTargetMinutes / 7))
    }
    return settings.dailyTargetMinutes
  }, [subject, settings.dailyTargetMinutes])

  // ── Trend: weekly totals for last 5 weeks ──
  const weeklyTrend = useMemo(() => {
    const weeks: { label: string; minutes: number; isCurrent: boolean }[] = []
    const now = new Date()
    for (let i = 4; i >= 0; i--) {
      const weekEnd = subDays(now, i * 7)
      const weekStart = subDays(startOfDay(now), i * 7 + 6)
      const label = i === 0 ? 'This week' : i === 1 ? 'Last week' : `${i}w ago`
      const mins = sessions
        .filter((s) => { const d = new Date(s.startAt); return d >= weekStart && d <= weekEnd })
        .reduce((sum, s) => sum + s.durationMinutes, 0)
      weeks.push({ label, minutes: mins, isCurrent: i === 0 })
    }
    return weeks
  }, [sessions])

  const prevWeekMinutes = weeklyTrend.length >= 2 ? weeklyTrend[1].minutes : 0
  const trendDelta = prevWeekMinutes > 0 ? weekMinutes - prevWeekMinutes : 0
  const trendPct = prevWeekMinutes > 0 ? Math.round((trendDelta / prevWeekMinutes) * 100) : 0
  const weekDailyAvg = Math.round(weekMinutes / 7)

  // ── Heatmap: 90-day grid ──
  const heatmapMinutes = useMemo(() => {
    const map: Record<string, number> = {}
    for (const s of sessions) {
      const ds = toLocalDateString(s.startAt)
      map[ds] = (map[ds] ?? 0) + s.durationMinutes
    }
    return map
  }, [sessions])

  // ── Sessions list (grouped by date) ──
  const sessionGroups = useMemo(() => {
    const groups: { date: string; label: string; items: Session[]; total: number }[] = []
    const recent = sessions.slice(0, 50)
    for (const s of recent) {
      const ds = toLocalDateString(s.startAt)
      let g = groups.find((x) => x.date === ds)
      if (!g) {
        const d = new Date(ds + 'T00:00:00')
        const label = ds === todayStr ? 'Today' : format(d, 'EEE d MMM')
        g = { date: ds, label, items: [], total: 0 }
        groups.push(g)
      }
      g.items.push(s)
      g.total += s.durationMinutes
    }
    return groups
  }, [sessions, todayStr])

  // ── Projects under this subject ──
  const projects = useMemo(
    () => data.projects.filter((p) => !p.deletedAt && p.subjectId === subject?.id),
    [data.projects, subject]
  )
  const projectMinutes = useMemo(() => {
    const map: Record<string, number> = {}
    for (const s of sessions) {
      if (s.projectId) map[s.projectId] = (map[s.projectId] ?? 0) + s.durationMinutes
    }
    return map
  }, [sessions])

  // ── Children ──
  const children = useMemo(
    () => subject ? getChildSubjects(subject.id, data.subjects) : [],
    [subject, data.subjects]
  )
  const childMinutes = useMemo(() => {
    const map: Record<string, number> = {}
    for (const s of sessions) {
      if (s.subjectId !== subject?.id) map[s.subjectId] = (map[s.subjectId] ?? 0) + s.durationMinutes
    }
    return map
  }, [sessions, subject])

  // ── Edit modal state ──
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [formData, setFormData] = useState<FormData>(emptyFormData)
  const [isSaving, setIsSaving] = useState(false)
  // ── Session detail modal state ──
  const [viewSession, setViewSession] = useState<Session | null>(null)
  const [viewModalOpen, setViewModalOpen] = useState(false)
  function copySessionInfo(s: Session) {
    const subj = data.subjects.find((sub) => sub.id === s.subjectId)?.name ?? 'Unknown'
    const proj = s.projectId ? data.projects.find((p) => p.id === s.projectId)?.name : undefined
    const date = format(new Date(s.startAt), 'EEE, MMM d, h:mm a')
    const duration = formatMinutes(s.durationMinutes)
    const parts = [subj, proj, date, duration, s.note].filter(Boolean)
    navigator.clipboard.writeText(parts.join(' | ')).catch(() => {})
  }
  const activeSubjects = data.subjects.filter((s) => !s.deletedAt)
  const activeCategories = data.categories.filter((c) => !c.deletedAt)

  function openEdit() {
    if (!subject) return
    setFormData({
      name: subject.name,
      categoryId: subject.categoryId,
      color: subject.color || DEFAULT_COLOR,
      parentSubjectId: subject.parentSubjectId ?? '',
      routine: subject.routine || [],
      weeklyTargetMinutes: subject.weeklyTargetMinutes || 60,
    })
    setEditOpen(true)
  }

  function toggleRoutineDay(day: number) {
    setFormData((prev) => ({
      ...prev,
      routine: prev.routine.includes(day) ? prev.routine.filter((d) => d !== day) : [...prev.routine, day],
    }))
  }

  async function handleSave() {
    if (!subject || !formData.name.trim()) return
    setIsSaving(true)
    try {
      const now = isoNow()
      const parentId = formData.parentSubjectId || null
      await db.subjects.update(subject.id, {
        name: formData.name.trim(),
        categoryId: formData.categoryId,
        color: formData.color,
        parentSubjectId: parentId,
        routine: formData.routine,
        weeklyTargetMinutes: formData.weeklyTargetMinutes,
        updatedAt: now,
      })
      await loadData()
      setEditOpen(false)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    if (!subject) return
    setIsSaving(true)
    try {
      const now = isoNow()
      const childIds = children.map((c) => c.id)
      // Capture the pre-delete state so undo can restore it.
      const deletedSubject = { ...subject }
      const deletedChildren = children.map((c) => ({ ...c }))
      const deletedSessions = data.sessions.filter(
        (s) => (s.subjectId === subject.id || childIds.includes(s.subjectId)) && !s.deletedAt
      ).map((s) => ({ ...s }))

      // Soft-delete the subject itself
      await softDelete(db.subjects, subject.id)
      // Cascade soft-delete sessions
      for (const s of deletedSessions) {
        await db.sessions.update(s.id, { deletedAt: now, updatedAt: now })
      }
      // Mark child subjects as deleted
      for (const c of children) {
        if (!c.deletedAt) await db.subjects.update(c.id, { deletedAt: now, updatedAt: now })
      }
      await loadData()
      pushUndo({
        description: `Deleted focus area "${subject.name}"`,
        undo: async () => {
          await db.subjects.put({ ...deletedSubject, deletedAt: null, updatedAt: isoNow() })
          for (const c of deletedChildren) {
            await db.subjects.put({ ...c, deletedAt: null, updatedAt: isoNow() })
          }
          for (const s of deletedSessions) {
            await db.sessions.put({ ...s, deletedAt: null, updatedAt: isoNow() })
          }
          await loadData()
        },
        redo: async () => {
          await db.subjects.update(subject.id, { deletedAt: now, updatedAt: isoNow() })
          for (const c of deletedChildren) {
            await db.subjects.update(c.id, { deletedAt: now, updatedAt: isoNow() })
          }
          for (const s of deletedSessions) {
            await db.sessions.update(s.id, { deletedAt: now, updatedAt: isoNow() })
          }
          await loadData()
        },
      })
      navigate('/subjects')
    } finally {
      setIsSaving(false)
    }
  }

  // ── Loading / not-found ──
  if (isLoading) return <PageSpinner />
  if (!subject) {
    return (
      <div className="space-y-4">
        <Link to="/subjects" className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400">← Back to Focus Areas</Link>
        <p className="text-red-600 dark:text-red-400">Focus area not found.</p>
      </div>
    )
  }

  // ── Heatmap grid ──
  const HEATMAP_DAYS = 90
  const heatDays = Array.from({ length: HEATMAP_DAYS }, (_, i) => {
    const d = subDays(new Date(), HEATMAP_DAYS - 1 - i)
    const ds = format(d, 'yyyy-MM-dd')
    return { date: d, ds, minutes: heatmapMinutes[ds] ?? 0 }
  })
  const firstDow = heatDays[0].date.getDay()
  const heatMax = Math.max(1, ...heatDays.map((d) => d.minutes))

  // ── Trend bar max ──
  const trendMax = Math.max(dailyTarget, ...weeklyTrend.map((w) => w.minutes / 7))

  const sourceBadge: Record<string, string> = {
    timer: 'Timer', pomodoro: 'Pomo', manual: 'Manual', quickLog: 'Quick', autoRoutine: 'Routine',
  }

  async function deleteSession(sid: string) {
    const session = data.sessions.find((s) => s.id === sid)
    if (!session) return
    await softDelete(db.sessions, sid)
    mutate(prev => ({ ...prev, sessions: prev.sessions.map(s => s.id === sid ? { ...s, deletedAt: isoNow() } : s) }))
    await Promise.all([revertRoutineLogsForSession(session), revertStreakDayForSession(session)])
    pushUndo({
      description: 'Deleted session',
      undo: async () => {
        await db.sessions.update(sid, { deletedAt: null, updatedAt: isoNow() })
        await loadData()
      },
      redo: async () => {
        await softDelete(db.sessions, sid)
        await loadData()
      },
    })
    await loadData()
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <Link to="/subjects" className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400">← Back to Focus Areas</Link>
          <div className="mt-2 flex items-center gap-3">
            <div className="h-4 w-4 shrink-0 rounded-full" title={colorName(subject.color || DEFAULT_COLOR)} style={{ backgroundColor: subject.color || DEFAULT_COLOR }} />
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">{subject.name}</h2>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            {category && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                {category.name}
              </span>
            )}
            {parent && (
              <span className="text-xs text-slate-400">under {parent.name}</span>
            )}
            {subject.routine && subject.routine.length > 0 && (
              <span className="text-xs text-slate-400">
                {subject.routine.map((d) => DAYS_OF_WEEK[d]).join(', ')}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={openEdit}>Edit</Button>
          <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>Delete</Button>
        </div>
      </div>

      {/* ── Quick stats ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([
          { label: 'Today', minutes: todaySessions.reduce((s, x) => s + x.durationMinutes, 0), count: todaySessions.length },
          { label: 'This Week', minutes: weekMinutes, count: weekSessions.length },
          { label: 'This Month', minutes: monthMinutes, count: monthSessions.length },
          { label: 'All Time', minutes: totalMinutes, count: sessions.length },
        ] as const).map((stat) => (
          <Card key={stat.label}>
            <div className="p-3">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{stat.label}</div>
              <div className="mt-1 text-2xl font-bold text-slate-800 dark:text-slate-100">{formatMinutes(stat.minutes)}</div>
              {stat.label === 'All Time' && (
                <div className="text-xs text-slate-400">{stat.count} session{stat.count === 1 ? '' : 's'}</div>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* ── Trend ── */}
      <Card>
        <CardHeader>
          <CardTitle>Weekly Trend</CardTitle>
        </CardHeader>
        <div className="px-4 pb-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <div className="text-slate-600 dark:text-slate-400">
              {weekDailyAvg > 0 ? `Daily avg: ${formatMinutes(weekDailyAvg)}` : 'No study this week'}
            </div>
            {prevWeekMinutes > 0 && (
              <div className={cn(
                'flex items-center gap-1 text-xs font-medium',
                trendDelta > 0 ? 'text-green-600 dark:text-green-400' : trendDelta < 0 ? 'text-red-500 dark:text-red-400' : 'text-slate-500'
              )}>
                <span>{trendDelta > 0 ? '↑' : trendDelta < 0 ? '↓' : '—'}</span>
                <span>{Math.abs(trendPct)}% vs last week</span>
              </div>
            )}
          </div>
          <div className="relative flex items-end gap-2" style={{ height: 180 }}>
            {/* Target reference line */}
            {dailyTarget > 0 && (
              <div
                className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-primary-400/60 dark:border-primary-400/40"
                style={{ bottom: `${Math.min(100, (dailyTarget / trendMax) * 100)}%` }}
              >
                <span className="absolute -top-4 right-0 text-[10px] text-primary-500 dark:text-primary-400">
                  target {formatMinutes(dailyTarget)}/day
                </span>
              </div>
            )}
            {weeklyTrend.map((w) => {
              const avgPerDay = w.minutes / 7
              const h = trendMax > 0 ? Math.max(2, (avgPerDay / trendMax) * 100) : 2
              return (
                <div key={w.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">{formatMinutes(w.minutes)}</span>
                  <div
                    className={cn(
                      'w-full max-w-10 rounded-t-md transition-all',
                      w.isCurrent
                        ? 'bg-gradient-to-t from-primary-600 to-primary-400 dark:from-primary-700 dark:to-primary-400'
                        : 'bg-slate-200 dark:bg-slate-700'
                    )}
                    style={{ height: `${h}%`, minHeight: 3 }}
                  />
                  <span className="w-full truncate text-center text-[10px] text-slate-400">{w.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      </Card>

      {/* ── Heatmap ── */}
      <Card>
        <CardHeader>
          <CardTitle>90-Day Heatmap</CardTitle>
        </CardHeader>
        <div className="px-4 pb-4">
          <div className="mb-1 grid grid-cols-7 gap-px text-[10px] font-medium text-slate-400">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((l, i) => (
              <div key={i} className="text-center">{l}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px rounded-sm border border-slate-200 bg-slate-200 dark:border-slate-700 dark:bg-slate-700 p-px">
            {Array.from({ length: firstDow }).map((_, i) => <div key={`pad-${i}`} />)}
            {heatDays.map(({ date, ds, minutes }) => {
              const isToday = ds === todayStr
              const pct = heatMax > 0 ? minutes / heatMax : 0
              const bg = minutes <= 0
                ? 'border-slate-300 bg-slate-100 dark:border-slate-600 dark:bg-slate-800'
                : pct < 0.33
                  ? 'border-green-200 bg-green-200 dark:border-green-900 dark:bg-green-900/40'
                  : pct < 0.66
                    ? 'border-green-400 bg-green-400 dark:border-green-700 dark:bg-green-700'
                    : 'border-green-600 bg-green-600 dark:border-green-500 dark:bg-green-500'
              return (
                <div
                  key={ds}
                  className={cn(
                    'group relative flex h-3.5 items-center justify-center transition-all border',
                    bg,
                    isToday && 'ring-2 ring-primary-400 ring-inset z-10'
                  )}
                >
                  <div className="pointer-events-none absolute -top-10 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100 dark:bg-slate-200 dark:text-slate-800">
                    {format(date, 'd MMM')}: {formatMinutes(minutes)}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1 text-[10px] text-slate-500">
            <span>None</span>
            <div className="h-3 w-3 rounded-sm border border-slate-300 bg-slate-100 dark:border-slate-600 dark:bg-slate-800" />
            <span>Low</span>
            <div className="h-3 w-3 rounded-sm border border-green-200 bg-green-200 dark:border-green-900 dark:bg-green-900/40" />
            <span>Medium</span>
            <div className="h-3 w-3 rounded-sm border border-green-400 bg-green-400 dark:border-green-700 dark:bg-green-700" />
            <span>High</span>
            <div className="h-3 w-3 rounded-sm border border-green-600 bg-green-600 dark:border-green-500 dark:bg-green-500" />
          </div>
        </div>
      </Card>

      {/* ── Sessions ── */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Sessions</CardTitle>
        </CardHeader>
        <div className="px-4 pb-4">
          {sessionGroups.length === 0 ? (
            <EmptyState title="No sessions yet" description="Start studying to see your session history here." />
          ) : (
            <div className="space-y-3">
              {sessionGroups.map((group) => (
                <div key={group.date}>
                  <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-500">
                    <span>{group.label}</span>
                    <span>{formatMinutes(group.total)}</span>
                  </div>
                  <div className="space-y-1">
                    {group.items.map((s) => (
                      <div key={s.id} className="flex items-center justify-between rounded bg-slate-50 px-3 py-1.5 text-sm dark:bg-slate-800">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-slate-600 dark:text-slate-300 shrink-0">
                            {format(new Date(s.startAt), 'h:mm a')}
                          </span>
                          {s.projectId && (
                            <span className="shrink-0 rounded bg-primary-100 px-1.5 py-0.5 text-[10px] font-medium text-primary-700 dark:bg-primary-900/50 dark:text-primary-300">
                              {data.projects.find((p) => p.id === s.projectId)?.name ?? 'Project'}
                            </span>
                          )}
                          {s.note && <span className="truncate text-slate-400 text-xs">. {s.note}</span>}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-[10px] text-slate-400">{sourceBadge[s.source] ?? s.source}</span>
                          <span className="font-medium text-slate-800 dark:text-slate-100">{formatMinutes(s.durationMinutes)}</span>
                          <KebabMenu
                            items={[
                              { label: 'View', action: () => { setViewSession(s); setViewModalOpen(true) } },
                              { label: 'Copy', action: () => copySessionInfo(s) },
                              { label: 'Delete', action: () => deleteSession(s.id), danger: true },
                            ]}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* ── Projects ── */}
      {projects.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Projects ({projects.length})</CardTitle>
          </CardHeader>
          <div className="space-y-1 px-4 pb-4">
            {projects.map((p) => (
              <Link
                key={p.id}
                to={`/projects/${p.id}`}
                className="flex items-center justify-between rounded px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                <div className="min-w-0">
                  <div className="font-medium text-slate-800 dark:text-slate-100 truncate">{p.name}</div>
                  {p.description && <div className="text-xs text-slate-400 truncate">{p.description}</div>}
                </div>
                <span className="shrink-0 text-sm font-medium text-slate-600 dark:text-slate-300">
                  {formatMinutes(projectMinutes[p.id] ?? 0)}
                </span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {/* ── Children ── */}
      {children.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Sub-Focus Areas ({children.length})</CardTitle>
          </CardHeader>
          <div className="space-y-1 px-4 pb-4">
            {children.map((c) => (
              <Link
                key={c.id}
                to={`/subjects/${c.id}`}
                className="flex items-center justify-between rounded px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-3 w-3 shrink-0 rounded-full" title={colorName(c.color || DEFAULT_COLOR)} style={{ backgroundColor: c.color || DEFAULT_COLOR }} />
                  <span className="font-medium text-slate-800 dark:text-slate-100 truncate">{c.name}</span>
                </div>
                <span className="shrink-0 text-sm font-medium text-slate-600 dark:text-slate-300">
                  {formatMinutes(childMinutes[c.id] ?? 0)}
                </span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {/* ── Edit Modal ── */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Focus Area">
        <div className="space-y-4">
          <div>
            <label className="label">Name</label>
            <input type="text" className="input w-full" value={formData.name} onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))} required />
          </div>
          <div>
            <label className="label">Category</label>
            <select className="input w-full" value={formData.categoryId} onChange={(e) => setFormData((p) => ({ ...p, categoryId: e.target.value }))} required>
              <option value="">Select category</option>
              {activeCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Parent subject</label>
            <select className="input w-full" value={formData.parentSubjectId} onChange={(e) => setFormData((p) => ({ ...p, parentSubjectId: e.target.value }))}>
              <option value="">Top-level subject</option>
              {activeSubjects.filter((s) => (s.parentSubjectId == null) && s.id !== subject?.id).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Colour</label>
            <ColorPicker value={formData.color} onChange={(c) => setFormData((p) => ({ ...p, color: c }))} />
          </div>
          <div>
            <label className="label">Routine</label>
            <div className="flex flex-wrap gap-2">
              {DAYS_OF_WEEK.map((day, i) => (
                <button key={day} type="button" onClick={() => toggleRoutineDay(i)} className={cn('rounded px-3 py-1 text-sm transition-colors', formData.routine.includes(i) ? 'bg-slate-600 text-white dark:bg-slate-500' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300')}>
                  {day}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Weekly Target (minutes)</label>
            <input type="text" inputMode="numeric" pattern="[0-9]*" className="input w-full" value={formData.weeklyTargetMinutes === 0 ? '' : String(formData.weeklyTargetMinutes)} onChange={(e) => { const v = e.target.value; if (v === '') { setFormData((p) => ({ ...p, weeklyTargetMinutes: 0 })); return } const n = Number(v); if (isNaN(n)) return; setFormData((p) => ({ ...p, weeklyTargetMinutes: n })) }} step="15" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleSave} disabled={isSaving}>{isSaving ? 'Saving...' : 'Save'}</Button>
          </div>
        </div>
      </Modal>

      {/* ── Delete Confirmation Modal ── */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete Focus Area">
        <div className="space-y-4">
          <p className="text-slate-600 dark:text-slate-300">
            Are you sure you want to delete <strong>{subject.name}</strong>?
            {children.length > 0 && <span className="block mt-1 text-amber-600 dark:text-amber-400">This will also delete {children.length} sub-focus area{children.length === 1 ? '' : 's'} and all their sessions.</span>}
            <span className="block mt-1 text-sm text-slate-500">All sessions under this focus area will be soft-deleted. This action can be undone.</span>
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete} disabled={isSaving}>{isSaving ? 'Deleting...' : 'Delete'}</Button>
          </div>
        </div>
      </Modal>

      <SessionDetailsModal
        session={viewSession}
        open={viewModalOpen}
        onClose={() => { setViewModalOpen(false); setViewSession(null) }}
        subjectName={viewSession ? (data.subjects.find((sub) => sub.id === viewSession.subjectId)?.name ?? 'Unknown') : undefined}
        subjects={data.subjects.filter((s) => !s.deletedAt)}
        onSave={async (updates) => {
          if (!viewSession) return
          const updatedSession = { ...viewSession, ...updates, updatedAt: isoNow() }
          await db.sessions.update(viewSession.id, updatedSession)
          const oldDate = toLocalDateString(viewSession.startAt)
          const newDate = toLocalDateString(updatedSession.startAt)
          await Promise.all([
            revertRoutineLogsForSession(viewSession),
            updateRoutineLogsForSession(updatedSession),
            recomputeStreakDaysForDates(Array.from(new Set([oldDate, newDate])).filter(Boolean)),
          ])
          await loadData()
        }}
      />
    </div>
  )
}
