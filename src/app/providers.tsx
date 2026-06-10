import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'
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
}

const DataContext = createContext<DataContextValue | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(emptyData)
  const [isLoading, setIsLoading] = useState(true)
  const [scope, setScope] = useState<ScopeFilter>('all')
  const [rangePreset, setRangePreset] = useState<RangePreset>('week')

  const loadData = useCallback(async () => {
    setIsLoading(true)
    const [
      categories, subjects, projects, tasks, sessions, progressLogs,
      marks, assignments, habits, habitLogs, streakDays,
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
    ])

    setData({
      categories: [...categories].sort((a, b) => a.name.localeCompare(b.name)),
      subjects: [...subjects].sort((a, b) => a.name.localeCompare(b.name)),
      projects: [...projects].sort((a, b) => a.name.localeCompare(b.name)),
      tasks: [...tasks].sort((a, b) => a.orderIndex - b.orderIndex),
      sessions: [...sessions].sort((a, b) => parseISO(b.startAt).getTime() - parseISO(a.startAt).getTime()),
      progressLogs: [...progressLogs].sort((a, b) => parseISO(b.loggedAt).getTime() - parseISO(a.loggedAt).getTime()),
      marks: [...marks].sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime()),
      assignments: [...assignments].sort((a, b) => parseISO(a.dueDate).getTime() - parseISO(b.dueDate).getTime()),
      habits: [...habits],
      habitLogs: [...habitLogs].sort((a, b) => b.date.localeCompare(a.date)),
      streakDays: [...streakDays].sort((a, b) => b.id.localeCompare(a.id)),
    })
    setIsLoading(false)
  }, [])

  useEffect(() => { void loadData() }, [loadData])

  const value = useMemo(
    () => ({ data, isLoading, scope, rangePreset, setScope, setRangePreset, loadData }),
    [data, isLoading, scope, rangePreset, loadData],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  const context = useContext(DataContext)
  if (!context) throw new Error('useData must be used within DataProvider')
  return context
}
