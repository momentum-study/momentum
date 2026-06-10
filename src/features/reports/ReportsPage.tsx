import { useData } from '../../app/providers'
import { Card, CardHeader, CardTitle } from '../../components/ui/Card'
import { PageSpinner } from '../../components/ui/Spinner'
import { formatHours, formatMinutes } from '../../lib/utils'

export default function ReportsPage() {
  const { data, isLoading } = useData()

  if (isLoading) return <PageSpinner />

  const totalMinutes = data.sessions.reduce((sum, s) => sum + s.durationMinutes, 0)

  // Group by subject
  const bySubject = data.sessions.reduce(
    (acc, session) => {
      const subject = data.subjects.find((s) => s.id === session.subjectId)
      const name = subject?.name ?? 'Unknown'
      acc[name] = (acc[name] ?? 0) + session.durationMinutes
      return acc
    },
    {} as Record<string, number>
  )

  return (
    <div className="space-y-6">
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
            <div className="text-2xl font-semibold text-slate-800 dark:text-slate-100">
              {data.sessions.length}
            </div>
          </div>
          <div>
            <div className="text-sm text-slate-500">Focus Areas</div>
            <div className="text-2xl font-semibold text-slate-800 dark:text-slate-100">
              {data.subjects.length}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Time by Focus Area</CardTitle>
        </CardHeader>
        {Object.keys(bySubject).length === 0 ? (
          <p className="text-sm text-slate-500">No data yet.</p>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-700">
            {Object.entries(bySubject)
              .sort((a, b) => b[1] - a[1])
              .map(([name, minutes]) => (
                <li key={name} className="flex items-center justify-between py-2">
                  <span className="text-slate-700 dark:text-slate-300">{name}</span>
                  <span className="font-medium text-slate-800 dark:text-slate-100">{formatMinutes(minutes)}</span>
                </li>
              ))}
          </ul>
        )}
      </Card>
    </div>
  )
}