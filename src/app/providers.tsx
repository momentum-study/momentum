import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { parseISO } from 'date-fns'
import { db } from '../db/app-db'

import type {
  Assignment,
  Category,
  Habit,
  HabitLog,
  Mark,
  Project,
  ProgressLog,
  Routine,
  RoutineLog,
  Session,
  StreakDay,
  Subject,
  Task,
} from '../domain/types'

export type AppData = {
  categories: Category[]
  subjects: Subject[]
  projects: Project[]
  tasks: Task[]
  sessions: Session[]
  progressLogs: ProgressLog[]
  marks: Mark[]
  assignments: Assignment[]
  habits: Habit[]
  habitLogs: HabitLog[]
  streakDays: StreakDay[]
  routines: Routine[]
  routineLogs: RoutineLog[]
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
  tasks: [],
  sessions: [],
  progressLogs: [],
  marks: [],
  assignments: [],
  habits: [],
  habitLogs: [],
  streakDays: [],
  routines: [],
  routineLogs: [],
}

async function loadAllData(): Promise<AppData> {
  const [
    categories, subjects, projects, tasks, sessions, progressLogs,
    marks, assignments, habits, habitLogs, streakDays,
    routines, routineLogs,
  ] = await Promise.all([
    db.categories.toArray(),
    db.subjects.toArray(),
    db.projects.toArray(),
    db.tasks.toArray(),
    db.sessions.toArray(),
    db.progressLogs.toArray(),
    db.marks.toArray(),
    db.assignments.toArray(),
    db.habits.toArray(),
    db.habitLogs.toArray(),
    db.streakDays.toArray(),
    db.routines.toArray(),
    db.routineLogs.toArray(),
  ])

  return {
    categories: [...categories].sort((a, b) => a.name.localeCompare(b.name)),
    subjects: [...subjects].sort((a, b) => a.name.localeCompare(b.name)),
    projects: [...projects].sort((a, b) => a.name.localeCompare(b.name)),
    tasks: [...tasks].sort((a, b) => a.orderIndex - b.orderIndex),
    sessions: [...sessions].sort((a, b) => parseISO(b.startAt).getTime() - parseISO(a.startAt).getTime()),
    progressLogs: [...progressLogs].sort((a, b) => parseISO(b.loggedAt).getTime() - parseISO(a.loggedAt).getTime()),
    marks: [...marks].sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime()),
    assignments: [...assignments].sort((a, b) => {
      const aDate = a.dueDate ? parseISO(a.dueDate).getTime() : 0
      const bDate = b.dueDate ? parseISO(b.dueDate).getTime() : 0
      return aDate - bDate
    }),
    habits: [...habits],
    habitLogs: [...habitLogs].sort((a, b) => b.date.localeCompare(a.date)),
    streakDays: [...streakDays].sort((a, b) => b.id.localeCompare(a.id)),
    routines: [...routines].sort((a, b) => a.name.localeCompare(b.name)),
    routineLogs: [...routineLogs].sort((a, b) => b.date.localeCompare(a.date)),
  }
}

const DataContext = createContext<DataContextValue | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(emptyData)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [scope, setScope] = useState<ScopeFilter>('all')
  const [rangePreset, setRangePreset] = useState<RangePreset>('week')

  // Debounce loadData so rapid mutations (e.g. spam-deleting logs) coalesce
  // into a single read instead of stacking 11-table scans on top of each other.
  const loadTimer = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const hasLoadedOnce = useRef(false)
  const loadData = useCallback(async () => {
    loadTimer.current = setTimeout(async () => {
      loadTimer.current = null
      const next = await loadAllData()
      setData(next)
      hasLoadedOnce.current = true
      setIsInitialLoad(false)
      // Cloud push is no longer done on every loadData — the real-time
      // onSnapshot listener in AuthProvider handles cross-device sync.
    }, 80)
  }, [])
  useEffect(() => { void loadData() }, [loadData])
  useEffect(() => {
    function onSynced() { void loadData() }
    window.addEventListener('momentum-data-synced', onSynced)
    return () => window.removeEventListener('momentum-data-synced', onSynced)
  }, [loadData])
  // On mount, if already signed in, pull fresh cloud data so this device
  // shows whatever changes happened on other devices.
  useEffect(() => {
    const uid = localStorage.getItem('momentum-cloud-uid')
    if (!uid) return
    void (async () => {
      const { pullAllData } = await import('../lib/data-sync')
      await pullAllData(uid)
      void loadData()
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
