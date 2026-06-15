import { useMemo, useState } from 'react'
import { useData } from '../../app/providers'
import { Card, CardHeader, CardTitle } from '../../components/ui/Card'
import { PageSpinner } from '../../components/ui/Spinner'
import { formatHours, formatMinutes, getSessionScope } from '../../lib/utils'

type ScopeOption = 'academic' | 'nonAcademic' | 'all'

const SCOPE_OPTIONS: { value: ScopeOption; label: string }[] = [
  { value: 'academic', label: 'Academic' },
  { value: 'nonAcademic', label: 'Non-academic' },
  { value: 'all', label: 'All' },
]

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function ReportsPage() {
  const { data, isLoading } = useData()
  const [scope, setScope] = useState<ScopeOption>('academic')

  const sessions = useMemo(() => {
    if (scope === 'all') return data.sessions
    return data.sessions.filter((s) => getSessionScope(s, data.subjects, data.categories) === scope)
  }, [data.sessions, data.subjects, data.categories, scope])

  const subjectsById = useMemo(() => new Map(data.subjects.map((s) => [s.id, s])), [data.subjects])
  const projectsById = useMemo(() => new Map(data.projects.map((p) => [p.id, p])), [data.projects])

  // Overview metrics
  const totalMinutes = sessions.reduce((sum, s) => sum + s.durationMinutes, 0)
  const sessionCount = sessions.length
  const focusAreaCount = useMemo(() => {
    const ids = new Set<string>()
    for (const s of sessions) ids.add(s.subjectId)
    return ids.size
  }, [sessions])

  // Time by Focus Area (subject name)
  const bySubject = useMemo(() => {
    const acc = new Map<string, number>()
    for (const s of sessions) {
      const name = subjectsById.get(s.subjectId)?.name ?? 'Unknown'
      acc.set(name, (acc.get(name) ?? 0) + s.durationMinutes)
    }
    return [...acc.entries()].sort((a, b) => b[1] - a[1])
  }, [sessions, subjectsById])

  // Time by Project
  const byProject = useMemo(() => {
    const acc = new Map<string, number>()
    for (const s of sessions) {
      let key = '(No project)'
      if (s.projectId) {
        const project = projectsById.get(s.projectId)
        if (project) {
          const subject = subjectsById.get(project.subjectId)
          key = subject ? `${subject.name} — ${project.name}` : project.name
        } else {
          key = '(Deleted project)'
        }
      }
      acc.set(key, (acc.get(key) ?? 0) + s.durationMinutes)
    }
    return [...acc.entries()].sort((a, b) => b[1] - a[1])
  }, [sessions, projectsById, subjectsById])

  // Time by Source
  const bySource = useMemo(() => {
    const acc = new Map<string, number>()
    for (const s of sessions) {
      acc.set(s.source, (acc.get(s.source) ?? 0) + s.durationMinutes)
    }
    return [...acc.entries()].sort((a, b) => b[1] - a[1])
  }, [sessions])

  // Insights
  const insights = useMemo(() => {
    if (sessions.length === 0) return [] as string[]

    const out: string[] = []

    if (bySubject.length > 0) {
      const [topName, topMinutes] = bySubject[0]
      out.push(`Your most studied subject is ${topName} with ${formatHours(topMinutes)}h`)
    }

    out.push(`You've logged ${sessionCount} session${sessionCount === 1 ? '' : 's'} this period`)

    const avgMinutes = Math.round(totalMinutes / sessionCount)
    out.push(`Average session length: ${formatMinutes(avgMinutes)}`)

    const longest = sessions.reduce((max, s) => (s.durationMinutes > max ? s.durationMinutes : max), 0)
    out.push(`Longest session: ${formatHours(longest)}h`)

    // Most productive day by total minutes
    const byDay = new Map<number, { total: number; count: number }>()
    for (const s of sessions) {
      const day = new Date(s.startAt).getDay()
      const cur = byDay.get(day) ?? { total: 0, count: 0 }
      cur.total += s.durationMinutes
      cur.count += 1
      byDay.set(day, cur)
    }
    const dayEntries = [...byDay.entries()]
    if (dayEntries.length > 0) {
      const [topDay, agg] = dayEntries.reduce((best, cur) => (cur[1].total > best[1].total ? cur : best))
      const avgForDay = Math.round(agg.total / agg.count)
      out.push(`Most productive day: ${DAY_NAMES[topDay]} (avg ${formatMinutes(avgForDay)})`)
    }

    return out
  }, [sessions, bySubject, sessionCount, totalMinutes])

  if (isLoading) return <PageSpinner />

  return (
    <div className="space-y-6">
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

      <Card>
        <CardHeader>
          <CardTitle>Overview</CardTitle>
        </CardHeader>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <div className="text-sm text-slate-500">Total Time</div>
            <div className="text-2xl font-semibold text-slate-800 dark:text-slate-100">
              {formatHours(totalMinutes)}h
            </div>
          </div>
          <div>
            <div className="text-sm text-slate-500">Sessions</div>
            <div className="text-2xl font-semibold text-slate-800 dark:text-slate-100">{sessionCount}</div>
          </div>
          <div>
            <div className="text-sm text-slate-500">Focus Areas</div>
            <div className="text-2xl font-semibold text-slate-800 dark:text-slate-100">{focusAreaCount}</div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Time by Focus Area</CardTitle>
        </CardHeader>
        {bySubject.length === 0 ? (
          <p className="text-sm text-slate-500">No data yet.</p>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-700">
            {bySubject.map(([name, minutes]) => (
              <li key={name} className="flex items-center justify-between py-2">
                <span className="text-slate-700 dark:text-slate-300">{name}</span>
                <span className="font-medium text-slate-800 dark:text-slate-100">{formatMinutes(minutes)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Time by Project</CardTitle>
        </CardHeader>
        {byProject.length === 0 ? (
          <p className="text-sm text-slate-500">No data yet.</p>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-700">
            {byProject.map(([name, minutes]) => (
              <li key={name} className="flex items-center justify-between py-2">
                <span className="text-slate-700 dark:text-slate-300">{name}</span>
                <span className="font-medium text-slate-800 dark:text-slate-100">{formatMinutes(minutes)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Time by Source</CardTitle>
        </CardHeader>
        {bySource.length === 0 ? (
          <p className="text-sm text-slate-500">No data yet.</p>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-700">
            {bySource.map(([source, minutes]) => (
              <li key={source} className="flex items-center justify-between py-2">
                <span className="capitalize text-slate-700 dark:text-slate-300">{source}</span>
                <span className="font-medium text-slate-800 dark:text-slate-100">{formatMinutes(minutes)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Insights</CardTitle>
        </CardHeader>
        {insights.length === 0 ? (
          <p className="text-sm text-slate-500">Log a session to see insights.</p>
        ) : (
          <ul className="space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
            {insights.map((line) => (
              <li key={line}>• {line}</li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
