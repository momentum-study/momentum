import { eachDayOfInterval, format, isSameDay, parseISO, subDays } from 'date-fns'
import type { Category, Session, Subject, Routine, RoutineLog, DayOfWeek } from '../domain/types'
import { getSessionScope } from './utils'

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export interface PeriodStats {
  totalMinutes: number
  academicMinutes: number
  nonAcademicMinutes: number
  totalSessions: number
  academicSessions: number
  nonAcademicSessions: number
  avgSessionLength: number
  dailyMinutes: number[]
  dailyAcademicMinutes: number[]
  mostProductiveDay: string | null
  mostProductiveDayMinutes: number
  subjectTime: Record<string, { minutes: number; sessions: number; scope: string }>
  pomodoroSessions: number
  pomodoroMinutes: number
  timerSessions: number
  timerMinutes: number
  manualSessions: number
  manualMinutes: number
  longestSession: number
  daysTargetMet: number
  daysInRange: number
  currentStreak: number
  autoRoutineSessions: number
  routineAdherence: Record<string, { planned: number; actual: number }>
}

interface CalculatePeriodStatsInput {
  weekSessions: Session[]
  allSessions: Session[]
  subjects: Subject[]
  categories: Category[]
  routines: Routine[]
  routineLogs: RoutineLog[]
  dateRange: { start: Date; end: Date }
  dailyTargetMinutes: number
}

/**
 * Compute the full set of statistics displayed on the AI Review page.
 *
 * Sessions are split by `Category.scope` ('academic' vs 'non-academic') so the
 * AI never confuses non-academic time for study time when assessing target
 * adherence or "most productive day".
 */
export function calculatePeriodStats(input: CalculatePeriodStatsInput): PeriodStats {
  const { weekSessions, allSessions, subjects, categories, routines, routineLogs, dateRange, dailyTargetMinutes } = input

  // Split sessions by scope
  const academicSessions = weekSessions.filter((s) => getSessionScope(s, subjects, categories) === 'academic')
  const nonAcademicSessions = weekSessions.filter((s) => getSessionScope(s, subjects, categories) !== 'academic')

  const totalMinutes = weekSessions.reduce((sum, s) => sum + s.durationMinutes, 0)
  const academicMinutes = academicSessions.reduce((sum, s) => sum + s.durationMinutes, 0)
  const nonAcademicMinutes = nonAcademicSessions.reduce((sum, s) => sum + s.durationMinutes, 0)
  const totalSessions = weekSessions.length
  const avgSessionLength = totalSessions > 0 ? Math.round(totalMinutes / totalSessions) : 0

  const days = eachDayOfInterval({ start: dateRange.start, end: dateRange.end })
  const dailyMinutes = days.map((day) => {
    const daySessions = weekSessions.filter((s) => isSameDay(parseISO(s.startAt), day))
    return daySessions.reduce((sum, s) => sum + s.durationMinutes, 0)
  })
  const dailyAcademicMinutes = days.map((day) => {
    const daySessions = academicSessions.filter((s) => isSameDay(parseISO(s.startAt), day))
    return daySessions.reduce((sum, s) => sum + s.durationMinutes, 0)
  })

  const maxDailyAcademic = Math.max(...dailyAcademicMinutes, 0)
  const mostProductiveDayIdx = dailyAcademicMinutes.indexOf(maxDailyAcademic)
  const mostProductiveDay = maxDailyAcademic > 0 ? DAY_NAMES[days[mostProductiveDayIdx]?.getDay() ?? 0] : null

  const subjectTime: Record<string, { minutes: number; sessions: number; scope: string }> = {}
  weekSessions.forEach((s) => {
    const subject = subjects.find((sub) => sub.id === s.subjectId)
    const name = subject?.name ?? 'Unknown'
    const scope = getSessionScope(s, subjects, categories) ?? 'unknown'
    if (!subjectTime[name]) {
      subjectTime[name] = { minutes: 0, sessions: 0, scope }
    }
    subjectTime[name].minutes += s.durationMinutes
    subjectTime[name].sessions += 1
  })

  const pomodoroSessions = weekSessions.filter((s) => s.source === 'pomodoro')
  const timerSessions = weekSessions.filter((s) => s.source === 'timer')
  const manualSessions = weekSessions.filter((s) => s.source === 'manual' || s.source === 'quickLog')

  const pomodoroMinutes = pomodoroSessions.reduce((sum, s) => sum + s.durationMinutes, 0)
  const timerMinutes = timerSessions.reduce((sum, s) => sum + s.durationMinutes, 0)
  const manualMinutes = manualSessions.reduce((sum, s) => sum + s.durationMinutes, 0)

  const longestSession = weekSessions.reduce(
    (max, s) => (s.durationMinutes > max ? s.durationMinutes : max),
    0
  )

  const daysTargetMet = dailyAcademicMinutes.filter((m) => m >= dailyTargetMinutes).length
  const autoRoutineSessions = weekSessions.filter((s) => s.source === 'autoRoutine').length

  const routineAdherence: Record<string, { planned: number; actual: number }> = {}
  for (const routine of routines.filter((r) => !r.deletedAt)) {
    const planned = days.reduce((sum, day) => sum + (routine.dayMinutes[day.getDay() as DayOfWeek] ?? 0), 0)
    if (planned <= 0) continue
    const logs = routineLogs.filter((l) => l.routineId === routine.id && l.date >= format(dateRange.start, 'yyyy-MM-dd') && l.date <= format(dateRange.end, 'yyyy-MM-dd'))
    const actual = logs.reduce((sum, l) => sum + (l.actualMinutes ?? 0), 0)
    routineAdherence[routine.name] = { planned, actual }
  }

  // Streak uses ALL sessions so it isn't truncated by the date range filter.
  const daySet = new Set(allSessions.filter(s => !s.deletedAt).map((s) => format(parseISO(s.startAt), 'yyyy-MM-dd')))
  let currentStreak = 0
  let consecutiveLogged = 0
  let freezes = 0
  let d = new Date(dateRange.end.getFullYear(), dateRange.end.getMonth(), dateRange.end.getDate())
  // Anchor: if the range ends today before logging, start from yesterday so the streak doesn't break.
  if (!daySet.has(format(d, 'yyyy-MM-dd'))) {
    d = subDays(d, 1)
  }
  while (true) {
    const ds = format(d, 'yyyy-MM-dd')
    if (daySet.has(ds)) {
      currentStreak++
      consecutiveLogged++
      if (consecutiveLogged === 5) {
        freezes++
        consecutiveLogged = 0
      }
    } else if (freezes > 0) {
      freezes--
      consecutiveLogged = 0
    } else {
      break
    }
    d = subDays(d, 1)
  }

  return {
    totalMinutes,
    academicMinutes,
    nonAcademicMinutes,
    totalSessions,
    academicSessions: academicSessions.length,
    nonAcademicSessions: nonAcademicSessions.length,
    avgSessionLength,
    dailyMinutes,
    dailyAcademicMinutes,
    mostProductiveDay,
    mostProductiveDayMinutes: maxDailyAcademic,
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
}