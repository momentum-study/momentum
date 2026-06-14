import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { parseISO } from 'date-fns'
import { db } from '../db/app-db'
import { pullAllData } from '../lib/data-sync'

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

  // Filter out records with invalid/missing required date fields so sort() and format() don't crash.
  // (Safeguard: cloud data from older app versions may lack these fields.)
  return {
    categories: [...categories].sort((a, b) => a.name.localeCompare(b.name)),
    subjects: [...subjects].sort((a, b) => a.name.localeCompare(b.name)),
    projects: [...projects].sort((a, b) => a.name.localeCompare(b.name)),
    tasks: [...tasks],
    sessions: [...sessions]
      .filter((s) => s.startAt && !isNaN(new Date(s.startAt).getTime()))
      .sort((a, b) => parseISO(b.startAt).getTime() - parseISO(a.startAt).getTime()),
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
    routineLogs: [...routineLogs].filter((l) => l.date),
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
      try {
        const next = await loadAllData()
        setData(next)
        hasLoadedOnce.current = true
      } catch (e) {
        console.error('loadAllData failed:', e)
      } finally {
        setIsInitialLoad(false)
      }
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
    void pullAllData(uid).then(() => void loadData())
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
