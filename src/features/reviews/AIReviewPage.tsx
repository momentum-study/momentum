import { useMemo, useState } from 'react'
import { format, parseISO, eachDayOfInterval, isWithinInterval, subDays } from 'date-fns'
import { calculatePeriodStats } from '../../lib/ai-review-stats'
import { useData } from '../../app/providers'
import { Card, CardHeader, CardTitle } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { PageSpinner } from '../../components/ui/Spinner'
import { cn, formatMinutes } from '../../lib/utils'
import { loadSettings } from '../../lib/settings-store'
import { getDatePresetRange, type DatePreset } from '../../lib/date-presets'


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

  // Filter non-deleted sessions for the date range
  const weekSessions = useMemo(() => {
    return data.sessions.filter((s) => {
      if (s.deletedAt) return false
      const sessionDate = parseISO(s.startAt)
      return isWithinInterval(sessionDate, { start: dateRange.start, end: dateRange.end })
    }).sort((a, b) => a.startAt.localeCompare(b.startAt))
  }, [data.sessions, dateRange])
  // Sessions merged: consecutive sessions within 10 min of each other are
  // collapsed so the AI doesn't count each as a separate session.
  const mergedSessions = useMemo(() => {
    if (weekSessions.length === 0) return []
    const result: { startAt: string; endAt: string; durationMinutes: number; subjectIds: Set<string>; count: number }[] = []
    let current = {
      startAt: weekSessions[0].startAt,
      endAt: weekSessions[0].endAt,
      durationMinutes: weekSessions[0].durationMinutes,
      subjectIds: new Set([weekSessions[0].subjectId]),
      count: 1,
    }
    for (let i = 1; i < weekSessions.length; i++) {
      const prev = weekSessions[i - 1]
      const next = weekSessions[i]
      const gapMinutes = (parseISO(next.startAt).getTime() - parseISO(prev.endAt).getTime()) / (1000 * 60)
      if (gapMinutes <= 10) {
        current.endAt = next.endAt
        current.durationMinutes += next.durationMinutes
        current.subjectIds.add(next.subjectId)
        current.count++
      } else {
        result.push(current)
        current = {
          startAt: next.startAt,
          endAt: next.endAt,
          durationMinutes: next.durationMinutes,
          subjectIds: new Set([next.subjectId]),
          count: 1,
        }
      }
    }
    result.push(current)
    return result
  }, [weekSessions])

  const stats = useMemo(
    () =>
      calculatePeriodStats({
        weekSessions,
        allSessions: data.sessions,
        subjects: data.subjects,
        categories: data.categories,
        routines: data.routines,
        routineLogs: data.routineLogs,
        dateRange,
        dailyTargetMinutes: settings.dailyTargetMinutes,
      }),
    [
      weekSessions,
      data.sessions,
      data.subjects,
      data.categories,
      data.routines,
      data.routineLogs,
      dateRange,
      settings.dailyTargetMinutes,
    ]
  )

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
    lines.push(`Weekly totals: ${formatMinutes(stats.totalMinutes)} across ${mergedSessions.length} study blocks (avg ${mergedSessions.length > 0 ? Math.round(stats.totalMinutes / mergedSessions.length) : 0}m, longest ${stats.longestSession}m). Most productive day: ${stats.mostProductiveDay ?? 'N/A'}${stats.mostProductiveDay ? ` (${stats.mostProductiveDayMinutes}m)` : ''}.`)
    lines.push(`Academic: ${formatMinutes(stats.academicMinutes)} (${stats.academicSessions} sessions). Non-academic: ${formatMinutes(stats.nonAcademicMinutes)} (${stats.nonAcademicSessions} sessions).`)
    lines.push(`Daily target: ${settings.dailyTargetMinutes}m (academic only). Days target met: ${stats.daysTargetMet}/${stats.daysInRange}. Current streak: ${stats.currentStreak} days.`)
    lines.push('')
    lines.push('### Daily breakdown (academic study time)')
    const days = eachDayOfInterval({ start: dateRange.start, end: dateRange.end })
    days.forEach((day, idx) => {
      const minutes = stats.dailyAcademicMinutes[idx] ?? 0
      const total = stats.dailyMinutes[idx] ?? 0
      let marker = ''
      if (isFuture(day)) marker = ' [future]'
      else if (isToday(day) && minutes === 0) marker = ' [today, not yet]'
      else if (minutes === 0) marker = ' [missed]'
      const nonAcad = total - minutes
      lines.push(`- ${format(day, 'EEE, MMM d')}: ${minutes}m academic${nonAcad > 0 ? ` (+${nonAcad}m non-academic)` : ''}${marker}`)
    })
    lines.push('### Study blocks (sessions ≤10 min apart are merged into one block)')
    if (mergedSessions.length === 0) {
      lines.push('- No study blocks in this period')
    } else {
      mergedSessions.forEach((block) => {
        const startD = parseISO(block.startAt)
        const endD = parseISO(block.endAt)
        const subjNames = Array.from(block.subjectIds)
          .map((id) => data.subjects.find((s) => s.id === id)?.name ?? 'Unknown')
          .join(' + ')
        const dur = Math.round((endD.getTime() - startD.getTime()) / (1000 * 60))
        const mergeNote = block.count > 1 ? ` (${block.count} sessions merged)` : ''
        lines.push(`- ${format(startD, 'EEE, MMM d h:mm a')} – ${format(endD, 'h:mm a')} | ${subjNames} | ${formatMinutes(dur)}${mergeNote}`)
      })
    }
    lines.push('')
    lines.push('### Focus area time')
    const sortedSubjects = Object.entries(stats.subjectTime).sort((a, b) => b[1].minutes - a[1].minutes)
    if (sortedSubjects.length === 0) {
      lines.push('- No focus area data')
    } else {
      sortedSubjects.forEach(([name, subj]) => {
        lines.push(`- ${name} [${subj.scope}]: ${formatMinutes(subj.minutes)} (${subj.sessions} sessions)`)
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
    const activeHabits = data.habits.filter(h => !h.deletedAt && !h.archivedAt && !h.finishedAt && h.status !== 'potential')
    if (activeHabits.length > 0) {
      lines.push('### Habits')
      activeHabits.forEach(habit => {
        const periodLogs = data.habitLogs.filter(l => l.habitId === habit.id && l.date >= format(dateRange.start, 'yyyy-MM-dd') && l.date <= format(dateRange.end, 'yyyy-MM-dd'))
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
  }, [dateRange, stats, settings.dailyTargetMinutes, data.habits, data.habitLogs, data.assignments, data.subjects, data.marks, weekSessions, mergedSessions])
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
        <div className="fixed bottom-0 left-0 right-0 z-20 bg-white/90 p-4 shadow-lg backdrop-blur-sm dark:bg-slate-800/90 border-t border-slate-200 dark:border-slate-700">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-4">
            <Button variant="primary" onClick={handleCopy}>
              {copied ? '✓ Copied!' : 'Copy to Clipboard'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => window.open(`https://claude.ai/new?q=${encodeURIComponent(aiPrompt)}`, '_blank', 'noopener,noreferrer')}
            >
              Open in Claude
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
        </div>
        <div className="h-20" /> {/* Spacer */}
      </Card>
    </div>
  )
}