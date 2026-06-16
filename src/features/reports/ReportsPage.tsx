import { useMemo, useState } from 'react'
import { format, subDays } from 'date-fns'
import { useData } from '../../app/providers'
import { Card, CardHeader, CardTitle } from '../../components/ui/Card'
import { PageSpinner } from '../../components/ui/Spinner'
import { cn, formatHours, formatMinutes, getSessionScope, pctToGrade, gradeColor } from '../../lib/utils'
import type { Session } from '../../domain/types'

type ScopeOption = 'academic' | 'nonAcademic' | 'all'
type Period = 'week' | 'month' | 'all'

const SCOPE_OPTIONS: { value: ScopeOption; label: string }[] = [
  { value: 'academic', label: 'Academic' },
  { value: 'nonAcademic', label: 'Non-academic' },
  { value: 'all', label: 'All' },
]

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'all', label: 'All Time' },
]

const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function filterSessionsByPeriod(sessions: Session[], period: Period): Session[] {
  if (period === 'all') return sessions
  const cutoff = subDays(new Date(), period === 'week' ? 7 : 30)
  return sessions.filter((s) => new Date(s.startAt) >= cutoff)
}

/** Build a Map of date-string → total minutes for a given set of sessions. */
function minutesByDate(sessions: Session[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const s of sessions) {
    const key = format(new Date(s.startAt), 'yyyy-MM-dd')
    m.set(key, (m.get(key) ?? 0) + s.durationMinutes)
  }
  return m
}

export default function ReportsPage() {
  const { data, isLoading } = useData()
  const [scope, setScope] = useState<ScopeOption>('academic')
  const [period, setPeriod] = useState<Period>('week')

  // Scope filter first
  const scopeFiltered = useMemo(() => {
    if (scope === 'all') return data.sessions
    return data.sessions.filter((s) => getSessionScope(s, data.subjects, data.categories) === scope)
  }, [data.sessions, data.subjects, data.categories, scope])

  // Period filter second
  const sessions = useMemo(() => filterSessionsByPeriod(scopeFiltered, period), [scopeFiltered, period])

  // Previous period for comparison
  const prevSessions = useMemo(() => {
    if (period === 'all') return [] as Session[]
    const days = period === 'week' ? 7 : 30
    const now = new Date()
    const periodStart = subDays(now, days)
    const prevEnd = subDays(periodStart, 1)
    const prevStart = subDays(prevEnd, days - 1)
    return scopeFiltered.filter((s) => {
      const d = new Date(s.startAt)
      return d >= prevStart && d <= prevEnd
    })
  }, [scopeFiltered, period])

  const subjectsById = useMemo(() => new Map(data.subjects.map((s) => [s.id, s])), [data.subjects])

  // ── Overview metrics ──
  const overview = useMemo(() => {
    const totalMinutes = sessions.reduce((sum, s) => sum + s.durationMinutes, 0)
    const sessionCount = sessions.length
    const longestSession = sessions.reduce((max, s) => Math.max(max, s.durationMinutes), 0)
    const avgSessionLength = sessionCount > 0 ? totalMinutes / sessionCount : 0
    const daySet = new Set(sessions.map((s) => format(new Date(s.startAt), 'yyyy-MM-dd')))
    const avgPerDay = daySet.size > 0 ? totalMinutes / daySet.size : 0

    // Previous period
    const prevTotal = prevSessions.reduce((sum, s) => sum + s.durationMinutes, 0)
    const prevCount = prevSessions.length
    const prevAvgLen = prevCount > 0 ? prevTotal / prevCount : 0
    const prevDaySet = new Set(prevSessions.map((s) => format(new Date(s.startAt), 'yyyy-MM-dd')))
    const prevAvgPerDay = prevDaySet.size > 0 ? prevTotal / prevDaySet.size : 0
    return { totalMinutes, sessionCount, avgSessionLength, avgPerDay, longestSession, prevTotal, prevCount, prevAvgLen, prevAvgPerDay }
  }, [sessions, prevSessions])

  const { totalMinutes, sessionCount, avgSessionLength, avgPerDay, longestSession, prevTotal, prevAvgLen, prevAvgPerDay } = overview

  const pctChange = prevTotal > 0 ? Math.round(((totalMinutes - prevTotal) / prevTotal) * 100) : null
  const avgLenChange = prevAvgLen > 0 ? Math.round(((avgSessionLength - prevAvgLen) / prevAvgLen) * 100) : null
  const avgDayChange = prevAvgPerDay > 0 ? Math.round(((avgPerDay - prevAvgPerDay) / prevAvgPerDay) * 100) : null

  // ── Time by Focus Area ──
  const bySubject = useMemo(() => {
    const acc = new Map<string, number>()
    for (const s of sessions) {
      const sub = subjectsById.get(s.subjectId)
      const name = sub?.name ?? 'Unknown'
      acc.set(name, (acc.get(name) ?? 0) + s.durationMinutes)
    }
    return [...acc.entries()].sort((a, b) => b[1] - a[1])
  }, [sessions, subjectsById])

  const subjectColors = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of sessions) {
      const sub = subjectsById.get(s.subjectId)
      if (sub) m.set(sub.name, sub.color)
    }
    return m
  }, [sessions, subjectsById])

  // ── Daily Trend (last 30 days heatmap) ──
  const dailyTrend = useMemo(() => {
    const byDate = minutesByDate(sessions)
    const days = period === 'week' ? 7 : period === 'month' ? 30 : 30
    const items: { date: Date; ds: string; minutes: number }[] = []
    for (let i = 0; i < days; i++) {
      const d = subDays(new Date(), days - 1 - i)
      const ds = format(d, 'yyyy-MM-dd')
      items.push({ date: d, ds, minutes: byDate.get(ds) ?? 0 })
    }
    const maxMinutes = Math.max(1, ...items.map((x) => x.minutes))
    return { items, maxMinutes }
  }, [sessions, period])

  // ── Grades by Subject ──
  const gradesBySubject = useMemo(() => {
    if (scope === 'nonAcademic') return [] as { subjectName: string; weightPct: number; letter: string; colorClass: string }[]
    // Get subject IDs in scope
    const subjectIdsInScope = new Set<string>()
    for (const s of data.subjects) {
      const cat = data.categories.find((c) => c.id === s.categoryId)
      if (scope === 'all' || cat?.scope === scope) {
        subjectIdsInScope.add(s.id)
      }
    }

    const marksInScope = data.marks.filter((m) => subjectIdsInScope.has(m.subjectId))
    if (marksInScope.length === 0) return []

    // Group by subject, compute weighted average
    const acc = new Map<string, { totalWeight: number; weightedScore: number }>()
    for (const m of marksInScope) {
      const sub = data.subjects.find((s) => s.id === m.subjectId)
      if (!sub) continue
      const name = sub.name
      const pct = m.total > 0 ? (m.score / m.total) * 100 : 0
      const entry = acc.get(name) ?? { totalWeight: 0, weightedScore: 0 }
      entry.totalWeight += m.weight
      entry.weightedScore += pct * m.weight
      acc.set(name, entry)
    }

    return [...acc.entries()]
      .map(([subjectName, { totalWeight, weightedScore }]) => {
        const weightPct = totalWeight > 0 ? weightedScore / totalWeight : 0
        const letter = pctToGrade(Math.round(weightPct))
        return { subjectName, weightPct, letter, colorClass: gradeColor(letter) }
      })
      .sort((a, b) => b.weightPct - a.weightPct)
  }, [data.marks, data.subjects, data.categories, scope])

  // ── Study Distribution by Day of Week ──
  const dayDistribution = useMemo(() => {
    const acc = new Array(7).fill(0)
    for (const s of sessions) {
      const day = new Date(s.startAt).getDay()
      acc[day] += s.durationMinutes
    }
    const maxMinutes = Math.max(1, ...acc)
    return acc.map((minutes, i) => ({ dayIndex: i, label: DAY_LABELS[i], shortLabel: DAY_NAMES_SHORT[i], minutes, pct: maxMinutes > 0 ? minutes / maxMinutes : 0 }))
  }, [sessions])
  // ── Insights ──
  const insights = useMemo(() => {
    if (sessions.length === 0) return [] as string[]
    const out: string[] = []

    // Most studied subject
    if (bySubject.length > 0) {
      const [topName, topMinutes] = bySubject[0]
      out.push(`Most studied subject: ${topName} with ${formatHours(topMinutes)}h`)
    }

    // Best day of week
    const bestDay = dayDistribution.reduce((best, cur) => (cur.minutes > best.minutes ? cur : best), dayDistribution[0])
    if (bestDay && bestDay.minutes > 0) {
      out.push(`Best day of week: ${bestDay.label} (${formatMinutes(bestDay.minutes)})`)
    }

    // Average session length
    out.push(`Average session length: ${formatMinutes(Math.round(avgSessionLength))}`)

    // Longest session
    out.push(`Longest session: ${formatHours(longestSession)}h`)

    // Comparison vs last period
    if (pctChange !== null && period !== 'all') {
      const arrow = pctChange >= 0 ? '↑' : '↓'
      out.push(`${arrow} ${Math.abs(pctChange)}% vs last ${period === 'week' ? 'week' : 'month'} (${formatHours(prevTotal)}h → ${formatHours(totalMinutes)}h)`)
    }

    // Session count insight
    if (sessionCount > 0) {
      out.push(`${sessionCount} session${sessionCount !== 1 ? 's' : ''} over ${dailyTrend.items.length} day${dailyTrend.items.length !== 1 ? 's' : ''}`)
    }

    return out
  }, [sessions, bySubject, dayDistribution, avgSessionLength, longestSession, pctChange, period, prevTotal, totalMinutes, sessionCount, dailyTrend.items.length])

  if (isLoading) return <PageSpinner />

  const dailyMax = dailyTrend.maxMinutes
  const todayStr = format(new Date(), 'yyyy-MM-dd')

  return (
    <div className="space-y-6">
      {/* Scope toggle */}
      <div className="inline-flex rounded-full bg-slate-200 p-1 dark:bg-slate-700" role="tablist" aria-label="Scope filter">
        {SCOPE_OPTIONS.map((opt) => {
          const active = scope === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setScope(opt.value)}
              className={
                active
                  ? 'rounded-full bg-primary-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors'
                  : 'rounded-full px-4 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
              }
            >
              {opt.label}
            </button>
          )
        })}
      </div>

      {/* 1. Period selector */}
      <div className="inline-flex rounded-full bg-slate-200 p-1 dark:bg-slate-700" role="tablist" aria-label="Period filter">
        {PERIOD_OPTIONS.map((opt) => {
          const active = period === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setPeriod(opt.value)}
              className={
                active
                  ? 'rounded-full bg-primary-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors'
                  : 'rounded-full px-4 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
              }
            >
              {opt.label}
            </button>
          )
        })}
      </div>

      {/* 2. Enhanced Overview card */}
      <Card>
        <CardHeader>
          <CardTitle>Overview</CardTitle>
        </CardHeader>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <div>
            <div className="text-sm text-slate-500">Total Time</div>
            <div className="text-2xl font-semibold text-slate-800 dark:text-slate-100">
              {formatHours(totalMinutes)}h
            </div>
            {pctChange !== null && period !== 'all' && (
              <div className={cn('text-xs font-medium', pctChange >= 0 ? 'text-green-600' : 'text-red-600')}>
                {pctChange >= 0 ? '↑' : '↓'} {Math.abs(pctChange)}%
              </div>
            )}
          </div>
          <div>
            <div className="text-sm text-slate-500">Sessions</div>
            <div className="text-2xl font-semibold text-slate-800 dark:text-slate-100">{sessionCount}</div>
          </div>
          <div>
            <div className="text-sm text-slate-500">Avg Session</div>
            <div className="text-2xl font-semibold text-slate-800 dark:text-slate-100">{formatMinutes(Math.round(avgSessionLength))}</div>
            {avgLenChange !== null && period !== 'all' && (
              <div className={cn('text-xs font-medium', avgLenChange >= 0 ? 'text-green-600' : 'text-red-600')}>
                {avgLenChange >= 0 ? '↑' : '↓'} {Math.abs(avgLenChange)}%
              </div>
            )}
          </div>
          <div>
            <div className="text-sm text-slate-500">Avg / Day</div>
            <div className="text-2xl font-semibold text-slate-800 dark:text-slate-100">{formatMinutes(Math.round(avgPerDay))}</div>
            {avgDayChange !== null && period !== 'all' && (
              <div className={cn('text-xs font-medium', avgDayChange >= 0 ? 'text-green-600' : 'text-red-600')}>
                {avgDayChange >= 0 ? '↑' : '↓'} {Math.abs(avgDayChange)}%
              </div>
            )}
          </div>
          <div>
            <div className="text-sm text-slate-500">Longest Session</div>
            <div className="text-2xl font-semibold text-slate-800 dark:text-slate-100">{formatHours(longestSession)}h</div>
          </div>
        </div>
      </Card>

      {/* 3. Time by Focus Area with bar chart */}
      <Card>
        <CardHeader>
          <CardTitle>Time by Focus Area</CardTitle>
        </CardHeader>
        {bySubject.length === 0 ? (
          <p className="text-sm text-slate-500">No data yet.</p>
        ) : (
          <div className="space-y-4">
            {/* Horizontal bar chart */}
            <div className="space-y-2">
              {bySubject.map(([name, minutes]) => {
                const pct = totalMinutes > 0 ? Math.round((minutes / totalMinutes) * 100) : 0
                const color = subjectColors.get(name) ?? '#6366f1'
                return (
                  <div key={name}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="text-slate-700 dark:text-slate-300">{name}</span>
                      <span className="font-medium text-slate-800 dark:text-slate-100">{formatMinutes(minutes)} ({pct}%)</span>
                    </div>
                    <div className="h-3 w-full rounded-full bg-slate-200 dark:bg-slate-700">
                      <div
                        className="h-3 rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
            {/* Table */}
            <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    <th className="px-3 py-2">Subject</th>
                    <th className="px-3 py-2 text-right">Minutes</th>
                    <th className="px-3 py-2 text-right">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {bySubject.map(([name, minutes]) => {
                    const pct = totalMinutes > 0 ? ((minutes / totalMinutes) * 100).toFixed(1) : '0.0'
                    return (
                      <tr key={name} className="text-slate-700 dark:text-slate-300">
                        <td className="px-3 py-1.5">{name}</td>
                        <td className="px-3 py-1.5 text-right font-medium">{formatMinutes(minutes)}</td>
                        <td className="px-3 py-1.5 text-right">{pct}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>

      {/* 4. Daily Trend heatmap */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Trend</CardTitle>
        </CardHeader>
        <div className="flex gap-1">
          <div className="flex flex-col gap-1 pr-1">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((l, i) => (
              <div key={i} className="flex h-4 w-3 items-center justify-center text-[9px] text-slate-400">{l}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 flex-1">
            {dailyTrend.items.map(({ date, ds, minutes }) => {
              const intensity = minutes === 0 ? 0 : 0.3 + (minutes / dailyMax) * 0.7
              const isToday = ds === todayStr
              return (
                <div
                  key={ds}
                  title={`${format(date, 'd MMM')}: ${formatMinutes(minutes)}`}
                  className={cn(
                    'h-4 w-full rounded-sm transition-all',
                    isToday && 'ring-2 ring-primary-500',
                    minutes === 0 && 'bg-slate-100 dark:bg-slate-800',
                  )}
                  style={minutes > 0 ? { backgroundColor: `rgba(34, 197, 94, ${intensity})` } : undefined}
                />
              )
            })}
          </div>
        </div>
        <div className="mt-2 flex items-center justify-end gap-1 text-xs text-slate-500">
          <span>Less</span>
          <div className="h-3 w-3 rounded-sm bg-slate-100 dark:bg-slate-800" />
          <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: 'rgba(34, 197, 94, 0.3)' }} />
          <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: 'rgba(34, 197, 94, 0.65)' }} />
          <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: 'rgba(34, 197, 94, 1)' }} />
          <span>More</span>
        </div>
      </Card>

      {/* 5. Grades by Subject */}
      {gradesBySubject.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Grades by Subject</CardTitle>
          </CardHeader>
          <div className="space-y-3">
            {gradesBySubject.map(({ subjectName, weightPct, letter, colorClass }) => (
              <div key={subjectName} className="flex items-center justify-between">
                <span className="text-slate-700 dark:text-slate-300">{subjectName}</span>
                <div className="flex items-center gap-3">
                  <div className="h-2 w-24 rounded-full bg-slate-200 dark:bg-slate-700">
                    <div
                      className="h-2 rounded-full bg-primary-500"
                      style={{ width: `${Math.min(100, Math.round(weightPct))}%` }}
                    />
                  </div>
                  <span className="w-12 text-right text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                    {weightPct.toFixed(1)}%
                  </span>
                  <span className={cn('w-6 text-right text-lg font-bold', colorClass)}>{letter}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 6. Study Distribution by Day of Week */}
      <Card>
        <CardHeader>
          <CardTitle>Study Distribution</CardTitle>
        </CardHeader>
        {dayDistribution.every((d) => d.minutes === 0) ? (
          <p className="text-sm text-slate-500">No data yet.</p>
        ) : (
          <div className="space-y-2">
            {dayDistribution.map(({ label, shortLabel, minutes, pct }) => (
              <div key={label} className="flex items-center gap-3">
                <span className="w-10 text-right text-xs text-slate-500">{shortLabel}</span>
                <div className="flex-1">
                  <div className="h-2.5 w-full rounded-full bg-slate-200 dark:bg-slate-700">
                    <div
                      className="h-2.5 rounded-full bg-primary-500 transition-all"
                      style={{ width: `${pct * 100}%` }}
                    />
                  </div>
                </div>
                <span className="w-14 text-right text-xs font-medium text-slate-700 dark:text-slate-300">
                  {formatMinutes(minutes)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 7. Insights */}
      <Card>
        <CardHeader>
          <CardTitle>Insights</CardTitle>
        </CardHeader>
        {insights.length === 0 ? (
          <p className="text-sm text-slate-500">Log a session to see insights.</p>
        ) : (
          <ul className="space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
            {insights.map((line, i) => (
              <li key={i}>• {line}</li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
