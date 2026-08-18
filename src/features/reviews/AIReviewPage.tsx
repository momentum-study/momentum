import { useMemo, useState } from 'react'
import { format, subDays, startOfWeek, endOfWeek, parseISO, eachDayOfInterval, isWithinInterval, isSameDay } from 'date-fns'
import { useData } from '../../app/providers'
import { Card, CardHeader, CardTitle } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { PageSpinner } from '../../components/ui/Spinner'
import { cn, formatMinutes } from '../../lib/utils'
import { loadSettings } from '../../lib/settings-store'
import type { DayOfWeek } from '../../domain/types'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

type DatePreset = 'thisWeek' | 'lastWeek' | 'last2Weeks' | 'last7Days'

function getDatePresetRange(preset: DatePreset): { start: Date; end: Date } {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  switch (preset) {
    case 'thisWeek': {
      const start = startOfWeek(today, { weekStartsOn: 1 }) // Monday
      const end = endOfWeek(today, { weekStartsOn: 1 })
      return { start, end }
    }
    case 'lastWeek': {
      const thisWeekStart = startOfWeek(today, { weekStartsOn: 1 })
      const start = subDays(thisWeekStart, 7)
      const end = subDays(thisWeekStart, 1)
      return { start, end }
    }
    case 'last2Weeks': {
      const thisWeekStart = startOfWeek(today, { weekStartsOn: 1 })
      const start = subDays(thisWeekStart, 14)
      const end = subDays(thisWeekStart, 1)
      return { start, end }
    }
    case 'last7Days': {
      // Sliding 7-day window ending today — guarantees a full week of data
      // regardless of which weekday the user opens the page on.
      const start = subDays(today, 6)
      const end = today
      return { start, end }
    }
  }
}

export default function AIReviewPage() {
  const { data, isLoading } = useData()
  const settings = loadSettings()
  const [datePreset, setDatePreset] = useState<DatePreset>('last7Days')
  const [customStart, setCustomStart] = useState<string>('')
  const [customEnd, setCustomEnd] = useState<string>('')
  const [showCustom, setShowCustom] = useState(false)
  const [copied, setCopied] = useState(false)

  // Calculate date range
  const dateRange = useMemo(() => {
    if (showCustom && customStart && customEnd) {
      return { start: parseISO(customStart), end: parseISO(customEnd) }
    }
    return getDatePresetRange(datePreset)
  }, [datePreset, customStart, customEnd, showCustom])

  // Filter sessions for the date range
  const weekSessions = useMemo(() => {
    return data.sessions.filter((s) => {
      const sessionDate = parseISO(s.startAt)
      return isWithinInterval(sessionDate, { start: dateRange.start, end: dateRange.end })
    })
  }, [data.sessions, dateRange])

  // Calculate stats
  const stats = useMemo(() => {
    const totalMinutes = weekSessions.reduce((sum, s) => sum + s.durationMinutes, 0)
    const totalSessions = weekSessions.length
    const avgSessionLength = totalSessions > 0 ? Math.round(totalMinutes / totalSessions) : 0

    // Daily breakdown
    const days = eachDayOfInterval({ start: dateRange.start, end: dateRange.end })
    const dailyMinutes = days.map((day) => {
      const daySessions = weekSessions.filter((s) => isSameDay(parseISO(s.startAt), day))
      return daySessions.reduce((sum, s) => sum + s.durationMinutes, 0)
    })

    // Most productive day
    const maxDailyMinutes = Math.max(...dailyMinutes, 0)
    const mostProductiveDayIdx = dailyMinutes.indexOf(maxDailyMinutes)
    const mostProductiveDay = maxDailyMinutes > 0 ? DAY_NAMES[days[mostProductiveDayIdx]?.getDay() ?? 0] : null

    // Time per subject
    const subjectTime: Record<string, { minutes: number; sessions: number }> = {}
    weekSessions.forEach((s) => {
      const subject = data.subjects.find((sub) => sub.id === s.subjectId)
      const name = subject?.name ?? 'Unknown'
      if (!subjectTime[name]) {
        subjectTime[name] = { minutes: 0, sessions: 0 }
      }
      subjectTime[name].minutes += s.durationMinutes
      subjectTime[name].sessions += 1
    })

    // Session types
    const pomodoroSessions = weekSessions.filter((s) => s.source === 'pomodoro')
    const timerSessions = weekSessions.filter((s) => s.source === 'timer')
    const manualSessions = weekSessions.filter((s) => s.source === 'manual' || s.source === 'quickLog')

    const pomodoroMinutes = pomodoroSessions.reduce((sum, s) => sum + s.durationMinutes, 0)
    const timerMinutes = timerSessions.reduce((sum, s) => sum + s.durationMinutes, 0)
    const manualMinutes = manualSessions.reduce((sum, s) => sum + s.durationMinutes, 0)

    // Longest session
    const longestSession = weekSessions.reduce(
      (max, s) => (s.durationMinutes > max ? s.durationMinutes : max),
      0
    )

    // Days target met
    const daysTargetMet = dailyMinutes.filter((m) => m >= settings.dailyTargetMinutes).length
    const autoRoutineSessions = weekSessions.filter((s) => s.source === 'autoRoutine').length
    // Routine adherence: planned vs actual minutes across routines in range.
    const routineAdherence: Record<string, { planned: number; actual: number }> = {}
    for (const routine of data.routines.filter((r) => !r.deletedAt)) {
      const planned = days.reduce((sum, day) => sum + (routine.dayMinutes[day.getDay() as DayOfWeek] ?? 0), 0)
      if (planned <= 0) continue
      const logs = data.routineLogs.filter((l) => l.routineId === routine.id && l.date >= format(dateRange.start, 'yyyy-MM-dd') && l.date <= format(dateRange.end, 'yyyy-MM-dd'))
      const actual = logs.reduce((sum, l) => sum + (l.actualMinutes ?? 0), 0)
      routineAdherence[routine.name] = { planned, actual }
    }


    // Total streak (consecutive days up to end of range)
    let currentStreak = 0
    let checkDate = dateRange.end
    const sortedStreakDays = [...data.streakDays].sort((a, b) => b.id.localeCompare(a.id))

    for (const streakDay of sortedStreakDays) {
      const streakDate = parseISO(streakDay.id)
      if (streakDate > checkDate) continue
      if (streakDate < dateRange.start) break

      // Check if this day is consecutive to the previous check date
      const diffDays = Math.floor((checkDate.getTime() - streakDate.getTime()) / (1000 * 60 * 60 * 24))
      if (diffDays > 1) break

      if (streakDay.goalMet) {
        currentStreak++
        checkDate = subDays(streakDate, 1)
      } else {
        break
      }
    }

    return {
      totalMinutes,
      totalSessions,
      avgSessionLength,
      dailyMinutes,
      mostProductiveDay,
      mostProductiveDayMinutes: maxDailyMinutes,
      subjectTime,
      pomodoroSessions: pomodoroSessions.length,
      pomodoroMinutes,
      timerSessions: timerSessions.length,
      timerMinutes,
      manualSessions: manualSessions.length,
      manualMinutes,
      longestSession,
      daysTargetMet,
      daysInRange: days.length,
      currentStreak,
      autoRoutineSessions,
      routineAdherence,
    }
  }, [weekSessions, data.subjects, data.streakDays, data.routines, data.routineLogs, dateRange, settings.dailyTargetMinutes])

  // Generate the AI prompt
  const aiPrompt = useMemo(() => {
    const startStr = format(dateRange.start, 'MMM d, yyyy')
    const endStr = format(dateRange.end, 'MMM d, yyyy')
    const dateRangeStr = `${startStr} - ${endStr}`

    // Distinguish "elapsed days with no data" from "future days not yet occurred".
    // The AI would otherwise see 0s for the rest of the week and recommend
    // unrealistic catch-up plans.
    const today = new Date()
    const todayKey = format(today, 'yyyy-MM-dd')
    const isToday = (d: Date) => format(d, 'yyyy-MM-dd') === todayKey
    const isFuture = (d: Date) => d.getTime() > today.getTime()

    const lines: string[] = []

    lines.push(`I'm a student using a study tracker app called Momentum. Here are my study statistics for the period ${dateRangeStr} (today is ${format(today, 'EEE, MMM d')}). Please give me a structured but concise review.`)
    lines.push('')
    lines.push('## Output format')
    lines.push('Reply in AT MOST 4 short sections, with these EXACT headings:')
    lines.push('### Headline (1 sentence)')
    lines.push('### What went well (2-4 bullets, max 1 line each)')
    lines.push('### What to improve (2-4 bullets, max 1 line each)')
    lines.push('### Next-week plan (3-5 bullets, concrete actions)')
    lines.push('Do NOT add any other sections. Do NOT include filler. Be specific to my data.')
    lines.push('')
    lines.push('## My data')
    lines.push(`Weekly totals: ${formatMinutes(stats.totalMinutes)} across ${stats.totalSessions} sessions (avg ${stats.avgSessionLength}m, longest ${stats.longestSession}m). Most productive day: ${stats.mostProductiveDay ?? 'N/A'}${stats.mostProductiveDay ? ` (${stats.mostProductiveDayMinutes}m)` : ''}.`)
    lines.push(`Daily target: ${settings.dailyTargetMinutes}m. Days target met: ${stats.daysTargetMet}/${stats.daysInRange}. Current streak: ${stats.currentStreak} days.`)
    lines.push('')
    lines.push('### Daily breakdown (note: future days in the range are marked `[future]`, do NOT treat them as missed days)')
    const days = eachDayOfInterval({ start: dateRange.start, end: dateRange.end })
    days.forEach((day, idx) => {
      const minutes = stats.dailyMinutes[idx] ?? 0
      let marker = ''
      if (isFuture(day)) marker = ' [future]'
      else if (isToday(day) && minutes === 0) marker = ' [today, not yet]'
      else if (minutes === 0) marker = ' [missed]'
      lines.push(`- ${format(day, 'EEE, MMM d')}: ${minutes}m${marker}`)
    })
    lines.push('')
    lines.push('### Focus area time')
    const sortedSubjects = Object.entries(stats.subjectTime).sort((a, b) => b[1].minutes - a[1].minutes)
    if (sortedSubjects.length === 0) {
      lines.push('- No focus area data')
    } else {
      sortedSubjects.forEach(([name, subj]) => {
        lines.push(`- ${name}: ${formatMinutes(subj.minutes)} (${subj.sessions} sessions)`)
      })
    }
    lines.push('')
    lines.push('### Session types')
    lines.push(`- Pomodoro: ${stats.pomodoroSessions} (${formatMinutes(stats.pomodoroMinutes)})`)
    lines.push(`- Simple timer: ${stats.timerSessions} (${formatMinutes(stats.timerMinutes)})`)
    lines.push(`- Manual: ${stats.manualSessions} (${formatMinutes(stats.manualMinutes)})`)
    lines.push(`- Routine auto-logs: ${stats.autoRoutineSessions ?? 0}`)
    lines.push('')

    // Habits
    const activeHabits = data.habits.filter(h => !h.archivedAt && h.status !== 'potential')
    if (activeHabits.length > 0) {
      lines.push('### Habits')
      activeHabits.forEach(habit => {
        const periodLogs = data.habitLogs.filter(l => l.habitId === habit.id && l.date >= startStr && l.date <= endStr)
        const uniqueDays = new Set(periodLogs.map(l => l.date)).size
        lines.push(`- ${habit.name} (${habit.kind}): ${uniqueDays} day${uniqueDays === 1 ? '' : 's'} in this period, target ${habit.targetPerDay ?? 1}/day`)
      })
      lines.push('')
    }

    // Marks
    const periodMarks = data.marks.filter(m => !m.deletedAt && m.date >= format(dateRange.start, 'yyyy-MM-dd') && m.date <= format(dateRange.end, 'yyyy-MM-dd'))
    if (periodMarks.length > 0) {
      lines.push('### Marks this period')
      periodMarks.forEach(m => {
        const subj = data.subjects.find(s => s.id === m.subjectId)
        const pct = m.total > 0 ? (m.score / m.total) * 100 : 0
        const avgStr = m.averageMark != null && m.total > 0 ? `, vs avg ${((m.averageMark / m.total) * 100).toFixed(1)}%` : ''
        lines.push(`- ${m.name} [${subj?.name ?? 'Unknown'}]: ${m.score}/${m.total} (${pct.toFixed(1)}%, weight ${m.weight}%${avgStr})`)
      })
      lines.push('')
    }

    // Upcoming assignments (this week + next 7 days)
    const upcomingAssignments = data.assignments.filter(a => !a.completed && !a.deletedAt)
    if (upcomingAssignments.length > 0) {
      lines.push('### Open assignments (next 7 days)')
      const upcoming7 = upcomingAssignments
        .filter(a => a.dueDate && a.dueDate <= format(subDays(today, -7), 'yyyy-MM-dd'))
        .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'))
        .slice(0, 15)
      upcoming7.forEach(task => {
        const subj = data.subjects.find(s => s.id === task.subjectId)
        lines.push(`- ${task.title} (due ${task.dueDate}) [${subj?.name ?? 'Unknown'}]`)
      })
      lines.push('')
    }

    // Routines adherence
    const routineAdherence: Array<[string, { planned: number; actual: number }]> = Object.entries((stats.routineAdherence ?? {}) as Record<string, { planned: number; actual: number }>)
    if (routineAdherence.length > 0) {
      lines.push('### Routine adherence this period')
      routineAdherence.forEach(([name, info]) => {
        const pct = info.planned > 0 ? Math.round((info.actual / info.planned) * 100) : 0
        lines.push(`- ${name}: ${info.actual}m of ${info.planned}m planned (${pct}%)`)
      })
      lines.push('')
    }

    // Session notes (recent sessions with notes or focus tags)
    const detailedSessions = weekSessions.filter(s => (s.note && s.note.trim() !== '') || s.focusTag)
    if (detailedSessions.length > 0) {
      lines.push('### Session notes & focus quality')
      detailedSessions.slice(0, 25).forEach(s => {
        const subj = data.subjects.find(sub => sub.id === s.subjectId)
        const subjName = subj?.name ?? 'Unknown'
        const date = format(parseISO(s.startAt), 'MMM d')
        const time = format(parseISO(s.startAt), 'h:mm a')
        const parts = [`- ${date} ${time} | ${subjName} | ${formatMinutes(s.durationMinutes)}`]
        if (s.focusTag) parts.push(`Focus: ${s.focusTag}`)
        if (s.note && s.note.trim() !== '') parts.push(`Note: ${s.note.trim()}`)
        lines.push(parts.join(' '))
      })
      lines.push('')
    }

    lines.push('Now produce the 4-section review.')
    return lines.join('\n')
  }, [dateRange, stats, settings.dailyTargetMinutes, data.habits, data.habitLogs, data.assignments, data.subjects, data.marks, weekSessions])
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(aiPrompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handlePresetChange = (preset: DatePreset) => {
    setDatePreset(preset)
    setShowCustom(false)
  }

  if (isLoading) return <PageSpinner />

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Select Date Range</CardTitle>
        </CardHeader>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={datePreset === 'last7Days' && !showCustom ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => handlePresetChange('last7Days')}
          >
            Last 7 Days
          </Button>
          <Button
            variant={datePreset === 'thisWeek' && !showCustom ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => handlePresetChange('thisWeek')}
          >
            This Week
          </Button>
          <Button
            variant={datePreset === 'lastWeek' && !showCustom ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => handlePresetChange('lastWeek')}
          >
            Last Week
          </Button>
          <Button
            variant={datePreset === 'last2Weeks' && !showCustom ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => handlePresetChange('last2Weeks')}
          >
            Last 2 Weeks
          </Button>
          <Button
            variant={showCustom ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setShowCustom(!showCustom)}
          >
            Custom
          </Button>
        </div>

        {showCustom && (
          <div className="mt-4 flex flex-wrap gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm text-slate-600 dark:text-slate-400">Start Date</label>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="input"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm text-slate-600 dark:text-slate-400">End Date</label>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="input"
              />
            </div>
          </div>
        )}
      </Card>

      {/* Stats Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Week Summary</CardTitle>
        </CardHeader>
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <div className="text-sm text-slate-500 dark:text-slate-400">Total Time</div>
            <div className="text-xl font-semibold text-slate-800 dark:text-slate-100">
              {formatMinutes(stats.totalMinutes)}
            </div>
          </div>
          <div>
            <div className="text-sm text-slate-500 dark:text-slate-400">Sessions</div>
            <div className="text-xl font-semibold text-slate-800 dark:text-slate-100">
              {stats.totalSessions}
            </div>
          </div>
          <div>
            <div className="text-sm text-slate-500 dark:text-slate-400">Avg Session</div>
            <div className="text-xl font-semibold text-slate-800 dark:text-slate-100">
              {stats.avgSessionLength}m
            </div>
          </div>
          <div>
            <div className="text-sm text-slate-500 dark:text-slate-400">Streak</div>
            <div className="text-xl font-semibold text-slate-800 dark:text-slate-100">
              {stats.currentStreak} days
            </div>
          </div>
        </div>
      </Card>

      {/* Generated Prompt */}
      <Card>
        <CardHeader>
          <CardTitle>AI Review Prompt</CardTitle>
        </CardHeader>
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
          Copy this prompt and paste it into ChatGPT, Gemini, Claude, or any AI assistant for a detailed weekly review.
        </p>
        <textarea
          readOnly
          value={aiPrompt}
          className={cn(
            'w-full h-96 resize-none rounded-md border p-3 text-sm font-mono',
            'bg-slate-50 text-slate-800 dark:bg-slate-900 dark:text-slate-100',
            'border-slate-200 dark:border-slate-700',
            'focus:outline-none focus:ring-2 focus:ring-primary-500'
          )}
        />
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <Button variant="primary" onClick={handleCopy}>
            {copied ? '✓ Copied!' : 'Copy to Clipboard'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => window.open(`https://chatgpt.com/?q=${encodeURIComponent(aiPrompt)}`, '_blank', 'noopener,noreferrer')}
          >
            Open in ChatGPT
          </Button>
          {typeof navigator !== 'undefined' && 'share' in navigator && (
            <Button
              variant="secondary"
              onClick={() => navigator.share({ title: 'Study Review', text: aiPrompt }).catch(() => {})}
            >
              Share
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}