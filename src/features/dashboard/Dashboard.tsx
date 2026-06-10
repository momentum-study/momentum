import { useMemo } from 'react'
import { format, subDays } from 'date-fns'
import { PomodoroTimer } from '../../components/widgets/PomodoroTimer'
import { useData } from '../../app/providers'
import { Card, CardHeader, CardTitle } from '../../components/ui/Card'
import { PageSpinner } from '../../components/ui/Spinner'
import { cn, formatMinutes } from '../../lib/utils'
import { loadSettings } from '../settings/SettingsPage'

export default function Dashboard() {
  const { data, isLoading } = useData()

  const todayStr = format(new Date(), 'yyyy-MM-dd')

  // Streak: count consecutive days with study activity, starting from today going backwards
  const streak = useMemo(() => {
    const daySet = new Set<string>()
    for (const s of data.sessions) {
      daySet.add(s.startAt.slice(0, 10))
    }
    // Also include streakDays
    for (const sd of data.streakDays) {
      daySet.add(sd.id)
    }
    let count = 0
    let d = new Date()
    while (true) {
      const ds = format(d, 'yyyy-MM-dd')
      if (daySet.has(ds)) {
        count++
        d = subDays(d, 1)
      } else {
        break
      }
    }
    return count
  }, [data.sessions, data.streakDays])

  // Heatmap: last 90 days of study time
  const heatmap = useMemo(() => {
    const dayMinutes: Record<string, number> = {}
    for (const s of data.sessions) {
      const day = s.startAt.slice(0, 10)
      dayMinutes[day] = (dayMinutes[day] ?? 0) + s.durationMinutes
    }
    const days = Array.from({ length: 90 }, (_, i) => {
      const d = subDays(new Date(), 89 - i)
      const ds = format(d, 'yyyy-MM-dd')
      return { date: ds, minutes: dayMinutes[ds] ?? 0 }
    })
    return days
  }, [data.sessions])

  if (isLoading) return <PageSpinner />

  const settings = loadSettings()

  const todayMinutes = data.sessions
    .filter((s) => s.startAt.startsWith(todayStr))
    .reduce((sum, s) => sum + s.durationMinutes, 0)

  const thisWeekStart = new Date()
  thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay())
  const weekStartStr = thisWeekStart.toISOString().slice(0, 10)
  const weekMinutes = data.sessions
    .filter((s) => s.startAt >= weekStartStr)
    .reduce((sum, s) => sum + s.durationMinutes, 0)

  const totalMinutes = data.sessions.reduce((sum, s) => sum + s.durationMinutes, 0)

  // Daily goal progress
  const goalPct = Math.min(100, Math.round((todayMinutes / settings.dailyTargetMinutes) * 100))

  const heatMax = Math.max(1, ...heatmap.map((d) => d.minutes))

  // Day-of-week headers for heatmap (7 columns, 13 weeks)
  const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

  // Recent sessions with subject names
  const recentSessions = data.sessions.slice(0, 8).map((s) => ({
    ...s,
    subjectName: data.subjects.find((sub) => sub.id === s.subjectId)?.name ?? 'Unknown',
  }))

  return (
    <div className="space-y-6">
      {/* Top stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <div className="text-sm text-slate-500 dark:text-slate-400">Today</div>
          <div className="mt-1 text-2xl font-semibold text-slate-800 dark:text-slate-100">
            {formatMinutes(todayMinutes)}
          </div>
        </Card>
        <Card>
          <div className="text-sm text-slate-500 dark:text-slate-400">This Week</div>
          <div className="mt-1 text-2xl font-semibold text-slate-800 dark:text-slate-100">
            {formatMinutes(weekMinutes)}
          </div>
        </Card>
        <Card>
          <div className="text-sm text-slate-500 dark:text-slate-400">Total</div>
          <div className="mt-1 text-2xl font-semibold text-slate-800 dark:text-slate-100">
            {formatMinutes(totalMinutes)}
          </div>
        </Card>
        <Card>
          <div className="text-sm text-slate-500 dark:text-slate-400">Sessions</div>
          <div className="mt-1 text-2xl font-semibold text-slate-800 dark:text-slate-100">
            {data.sessions.length}
          </div>
        </Card>
      </div>

      {/* Streak & Daily Goal */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>🔥 Study Streak</CardTitle>
          </CardHeader>
          <div className="flex items-end gap-2">
            <span className="text-4xl font-bold text-orange-500">{streak}</span>
            <span className="text-sm text-slate-500 dark:text-slate-400">day{streak !== 1 ? 's' : ''}</span>
          </div>
          {streak === 0 && (
            <p className="mt-2 text-sm text-slate-500">Log a session today to start your streak!</p>
          )}
          {/* Week view */}
          <div className="mt-3 flex gap-2">
            {weekDays.map((label, i) => {
              const d = new Date()
              d.setDate(d.getDate() - d.getDay() + i)
              const ds = format(d, 'yyyy-MM-dd')
              const hasStudy = data.sessions.some((s) => s.startAt.startsWith(ds)) || data.streakDays.some((sd) => sd.id === ds)
              const isDayToday = ds === todayStr
              return (
                <div key={i} className="flex flex-col items-center gap-1">
                  <div
                    className={cn(
                      'h-6 w-6 rounded-full text-xs flex items-center justify-center font-medium',
                      hasStudy
                        ? 'bg-orange-400 text-white'
                        : 'bg-slate-200 text-slate-400 dark:bg-slate-700 dark:text-slate-500',
                      isDayToday && 'ring-2 ring-orange-500'
                    )}
                  >
                    {label}
                  </div>
                  {hasStudy && <span className="text-xs text-orange-500">🔥</span>}
                </div>
              )
            })}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>🎯 Daily Goal</CardTitle>
          </CardHeader>
          <div className="flex items-end gap-2">
            <span className="text-4xl font-bold text-primary-600 dark:text-primary-400">{goalPct}%</span>
            <span className="text-sm text-slate-500 dark:text-slate-400">of {settings.dailyTargetMinutes}m</span>
          </div>
          <div className="mt-3 h-3 w-full rounded-full bg-slate-200 dark:bg-slate-700">
            <div
              className={cn(
                'h-3 rounded-full transition-all',
                goalPct >= 100 ? 'bg-green-500' : 'bg-primary-500'
              )}
              style={{ width: `${goalPct}%` }}
            />
          </div>
          {goalPct >= 100 && (
            <p className="mt-2 text-sm font-medium text-green-600 dark:text-green-400">Goal reached! 🎉</p>
          )}
          {goalPct < 100 && todayMinutes > 0 && (
            <p className="mt-2 text-sm text-slate-500">
              {formatMinutes(settings.dailyTargetMinutes - todayMinutes)} to go
            </p>
          )}
        </Card>
      </div>
      {/* Pomodoro Timer */}
      <PomodoroTimer />

      {/* Study Heatmap */}
      <Card>
        <CardHeader>
          <CardTitle>📊 Study Heatmap — Last 90 Days</CardTitle>
        </CardHeader>
        <div className="flex flex-wrap gap-1">
          {heatmap.map((d) => {
            const intensity = d.minutes / heatMax
            let bg = 'bg-slate-200 dark:bg-slate-700'
            if (d.minutes > 0) {
              if (intensity > 0.75) bg = 'bg-green-600'
              else if (intensity > 0.5) bg = 'bg-green-500'
              else if (intensity > 0.25) bg = 'bg-green-400 dark:bg-green-600'
              else bg = 'bg-green-300 dark:bg-green-700'
            }
            return (
              <div
                key={d.date}
                className={cn('h-3 w-3 rounded-sm', bg)}
                title={`${d.date}: ${formatMinutes(d.minutes)}`}
              />
            )
          })}
        </div>
        <div className="mt-2 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
          <span>Less</span>
          <div className="h-3 w-3 rounded-sm bg-slate-200 dark:bg-slate-700" />
          <div className="h-3 w-3 rounded-sm bg-green-300 dark:bg-green-700" />
          <div className="h-3 w-3 rounded-sm bg-green-400 dark:bg-green-600" />
          <div className="h-3 w-3 rounded-sm bg-green-500" />
          <div className="h-3 w-3 rounded-sm bg-green-600" />
          <span>More</span>
        </div>
      </Card>

      {/* Recent Sessions */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Sessions</CardTitle>
        </CardHeader>
        {recentSessions.length === 0 ? (
          <p className="text-sm text-slate-500">No sessions yet. Start studying!</p>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-700">
            {recentSessions.map((session) => (
              <li key={session.id} className="flex items-center justify-between py-2">
                <div>
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                    {session.subjectName}
                  </div>
                  <div className="text-xs text-slate-500">
                    {new Date(session.startAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-300">
                  {formatMinutes(session.durationMinutes)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
