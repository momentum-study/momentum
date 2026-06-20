import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { parseISO, format, subDays } from 'date-fns'
import { db } from '../db/app-db'
import { pullAllData, flushPendingDirtyTables } from '../lib/data-sync'
import { loadSettings } from '../features/settings/SettingsPage'

import type {
  Assignment,
  Category,
  DayOfWeek,
  Habit,
  HabitLog,
  Hobby,
  HobbySession,
  Mark,
  Project,
  ProgressLog,
  Routine,
  RoutineLog,
  ScheduleEntry,
  Session,
  StreakDay,
  Subject,
  StudyArea,
  StudyReview,
} from '../domain/types'
export type AppData = {
  categories: Category[]
  subjects: Subject[]
  projects: Project[]
  sessions: Session[]
  progressLogs: ProgressLog[]
  marks: Mark[]
  assignments: Assignment[]
  habits: Habit[]
  habitLogs: HabitLog[]
  streakDays: StreakDay[]
  routines: Routine[]
  routineLogs: RoutineLog[]
  scheduleEntries: ScheduleEntry[]
  hobbies: Hobby[]
  hobbySessions: HobbySession[]
  studyAreas: StudyArea[]
  studyReviews: StudyReview[]
}

type ScopeFilter = 'all' | 'academic' | 'nonAcademic'
type RangePreset = 'day' | 'week' | 'month' | 'year' | 'custom'

export interface DataContextValue {
  data: AppData
  isLoading: boolean
  scope: ScopeFilter
  rangePreset: RangePreset
  setScope: (scope: ScopeFilter) => void
  setRangePreset: (preset: RangePreset) => void
  loadData: () => Promise<void>
}

const emptyData: AppData = {
  categories: [],
  subjects: [],
  projects: [],
  sessions: [],
  progressLogs: [],
  marks: [],
  assignments: [],
  habits: [],
  habitLogs: [],
  streakDays: [],
  routines: [],
  routineLogs: [],
  scheduleEntries: [],
  hobbies: [],
  hobbySessions: [],
  studyAreas: [],
  studyReviews: [],
}

async function loadAllData(): Promise<AppData> {
  const [
    categories, subjects, projects, sessions, progressLogs,
    marks, assignments, habits, habitLogs, streakDays,
    routines, routineLogs, scheduleEntries, hobbies, hobbySessions,
    studyAreas, studyReviews,
  ] = await Promise.all([
    db.categories.toArray(),
    db.subjects.toArray(),
    db.projects.toArray(),
    db.sessions.toArray(),
    db.progressLogs.toArray(),
    db.marks.toArray(),
    db.assignments.toArray(),
    db.habits.toArray(),
    db.habitLogs.toArray(),
    db.streakDays.toArray(),
    db.routines.toArray(),
    db.routineLogs.toArray(),
    db.scheduleEntries.toArray(),
    db.hobbies.toArray(),
    db.hobbySessions.toArray(),
    db.studyAreas.toArray(),
    db.studyReviews.toArray(),
  ])

  return {
    categories: [...categories].sort((a, b) => a.name.localeCompare(b.name)),
    subjects: [...subjects].sort((a, b) => a.name.localeCompare(b.name)),
    sessions: [...sessions]
      .filter((s) => s.startAt && !isNaN(new Date(s.startAt).getTime()))
      .sort((a, b) => parseISO(b.startAt).getTime() - parseISO(a.startAt).getTime()),
    projects: [...projects].sort((a, b) => a.name.localeCompare(b.name)),
    progressLogs: [...progressLogs]
      .filter((l) => l.loggedAt && !isNaN(new Date(l.loggedAt).getTime()))
      .sort((a, b) => parseISO(b.loggedAt).getTime() - parseISO(a.loggedAt).getTime()),
    marks: [...marks]
      .filter((m) => m.date && !isNaN(new Date(m.date).getTime()))
      .sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime()),
    assignments: [...assignments],
    habits: [...habits],
    habitLogs: [...habitLogs].filter((l) => l.date),
    streakDays: [...streakDays],
    routines: [...routines].sort((a, b) => a.name.localeCompare(b.name)),
    routineLogs: [...routineLogs].sort((a, b) => b.date.localeCompare(a.date)),
    scheduleEntries: [...scheduleEntries].sort((a, b) => {
      if (a.subjectId !== b.subjectId) return a.subjectId.localeCompare(b.subjectId)
      return a.dayOfWeek - b.dayOfWeek
    }),
    hobbies: [...hobbies].sort(((a, b) => a.name.localeCompare(b.name))),
    hobbySessions: [...hobbySessions].sort(((a, b) => parseISO(b.startAt).getTime() - parseISO(a.startAt).getTime())),
    studyAreas: [...studyAreas].sort(((a, b) => a.name.localeCompare(b.name))),
    studyReviews: [...studyReviews].sort(((a, b) => parseISO(b.reviewedAt).getTime() - parseISO(a.reviewedAt).getTime())),
  }
}
const DataContext = createContext<DataContextValue | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(emptyData)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [scope, setScope] = useState<ScopeFilter>('all')
  const [rangePreset, setRangePreset] = useState<RangePreset>('week')
  const loadTimer = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const pullInProgress = useRef(false)
  const loadData = useCallback(async () => {
    async function ensureAutoLogSessions(snapshot: AppData): Promise<boolean> {
      const settings = loadSettings()
      if (!settings.autoLogEnabled) return false

      const today = new Date()
      const todayStr = format(today, 'yyyy-MM-dd')
      const todayDow = today.getDay() as DayOfWeek
      const weekStart = format(subDays(today, today.getDay()), 'yyyy-MM-dd')
      let created = false

      for (const routine of snapshot.routines) {
        if (routine.deletedAt || !routine.autoLog || !routine.days.includes(todayDow)) continue
        if (routine.skippedWeekStart && weekStart <= routine.skippedWeekStart) continue
        const exists = snapshot.sessions.some((s) => s.routineId === routine.id && s.startAt.slice(0, 10) === todayStr)
        if (exists) continue
        const now = new Date()
        const startAt = new Date(now)
        startAt.setHours(0, 0, 0, 0)
        const endAt = new Date(startAt.getTime() + (routine.autoLogMinutes ?? routine.targetMinutes) * 60_000)
        await db.sessions.add({
          id: crypto.randomUUID?.() ?? `${Date.now()}_${routine.id}`,
          subjectId: routine.subjectId,
          projectId: routine.projectId ?? null,
          routineId: routine.id,
          startAt: now.toISOString(),
          endAt: endAt.toISOString(),
          durationMinutes: routine.autoLogMinutes ?? routine.targetMinutes,
          note: routine.notes || routine.name,
          source: 'autoRoutine',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: new Date().toISOString(),
        })
        created = true
      }
      return created
    }

    if (pullInProgress.current) return
    if (loadTimer.current) clearTimeout(loadTimer.current)
    loadTimer.current = setTimeout(async () => {
      loadTimer.current = null
      try {
        const next = await loadAllData()
        const autoCreated = await ensureAutoLogSessions(next)
        setData(autoCreated ? await loadAllData() : next)
      } catch (e) {
        console.error('loadAllData failed:', e)
      } finally {
        setIsInitialLoad(false)
      }
    }, 80)
  }, [])
  // On mount: pull cloud data first (if signed in), then load
  useEffect(() => {
    async function init() {
      pullInProgress.current = true
      try {
        const uid = localStorage.getItem('momentum-cloud-uid')
        if (uid) await pullAllData(uid)
      } finally {
        pullInProgress.current = false
      }
      await loadData()
    }
    void init()
  }, [loadData])
  useEffect(() => {
    function onSynced() { void loadData() }
    window.addEventListener('momentum-data-synced', onSynced)
    return () => window.removeEventListener('momentum-data-synced', onSynced)
  }, [loadData])
  // On startup, flush any dirty tables that survived from a previous session
  flushPendingDirtyTables()
  const value = useMemo(
    () => ({ data, isLoading: isInitialLoad, scope, rangePreset, setScope, setRangePreset, loadData }),
    [data, isInitialLoad, scope, rangePreset, loadData],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}
export function useData() {
  const context = useContext(DataContext)
  if (!context) throw new Error('useData must be used within DataProvider')
  return context
}

export function useDataSelector<T>(selector: (data: AppData) => T): T {
  const { data } = useData()
  return useMemo(() => selector(data), [data])
}

export function useSubjects()       { return useDataSelector(d => d.subjects) }
export function useSessions()        { return useDataSelector(d => d.sessions) }
export function useAssignments()     { return useDataSelector(d => d.assignments) }
export function useHobbies()         { return useDataSelector(d => d.hobbies) }
export function useHobbySessions()   { return useDataSelector(d => d.hobbySessions) }
