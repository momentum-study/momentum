// Domain types for the study app

export type Scope = 'academic' | 'nonAcademic'

export interface Category {
  id: string
  name: string
  scope: Scope
  color: string
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
}

export interface Subject {
  id: string
  categoryId: string
  name: string
  color: string
  routine?: number[] // 0-6 (Sun-Sat); days of week the subject is studied
  weeklyTargetMinutes?: number
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
}

export interface Project {
  id: string
  subjectId: string
  name: string
  description?: string
  goalMinutes?: number
  dueDate?: string
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
}

export interface Task {
  id: string
  projectId: string
  name: string
  orderIndex: number
  done: boolean
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
}

export interface Session {
  id: string
  subjectId: string
  projectId?: string | null
  startAt: string // ISO
  endAt: string // ISO
  durationMinutes: number
  note?: string
  source: 'manual' | 'timer' | 'pomodoro' | 'quickLog'
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
}

export interface ProgressLog {
  id: string
  subjectId: string
  loggedAt: string // ISO
  value: number
  unit?: string
  note?: string
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
}

// Mark tracker — for academic subjects
export interface Mark {
  id: string
  subjectId: string
  name: string // e.g. "Midterm", "Assignment 1"
  score: number // mark achieved
  total: number // maximum possible
  averageMark?: number | null // class average (optional)
  weight: number // weighting percentage (0-100)
  letterGrade?: string | null // e.g. "A", "B+", "C"; auto-computed if omitted
  date: string // ISO date
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
}

// Task tracker — simple tasks with category & weighting for grade tracking
export type TaskCategory = 'homework' | 'assignments' | 'miscellaneous'

export interface Assignment {
  id: string
  subjectId: string
  projectId?: string | null
  title: string
  description?: string
  dueDate: string // ISO date
  category: TaskCategory // homework | assignments | miscellaneous
  weight: number // percentage weight (0-100) of the final grade; 0 if not graded
  completed: boolean
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
}

export const TASK_CATEGORIES: { value: TaskCategory; label: string; color: string }[] = [
  { value: 'homework', label: 'Homework', color: '#3b82f6' },
  { value: 'assignments', label: 'Assignments', color: '#a855f7' },
  { value: 'miscellaneous', label: 'Miscellaneous', color: '#64748b' },
]

// Habit tracker
export type HabitKind = 'good' | 'bad'

export interface Habit {
  id: string
  name: string
  kind: HabitKind
  color: string
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
}

export interface HabitLog {
  id: string
  habitId: string
  date: string // ISO date (YYYY-MM-DD)
  time?: string // HH:MM time of day
  note?: string
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
}

// Streak — one row per day that had study activity
export interface StreakDay {
  id: string // the date string YYYY-MM-DD
  totalMinutes: number
  goalMet: boolean
  createdAt: string
}
