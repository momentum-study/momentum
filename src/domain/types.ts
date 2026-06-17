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
  dailyTargetMinutes?: number
  weeklyTargetMinutes?: number
  goalMinutes?: number
  totalTargetMinutes?: number
  dueDate?: string
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
}


export interface Session {
  id: string
  subjectId: string
  projectId?: string | null
  assignmentId?: string | null
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
  dueDate: string // ISO date; empty string = no due date
  category: TaskCategory // homework | assignments | miscellaneous
  weight: number // percentage weight (0-100) of the final grade; 0 if not graded
  completed: boolean
  orderIndex?: number
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
  archivedAt?: string | null
  archivedAfterDays?: number | null
  status?: 'active' | 'potential'
  targetPerDay?: number
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
  value?: number
}

// Streak — one row per day that had study activity
export interface StreakDay {
  id: string // the date string YYYY-MM-DD
  totalMinutes: number
  goalMet: boolean
  createdAt: string
}

// Routines — weekly study schedule

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6  // 0=Sun, 6=Sat

export interface Routine {
  id: string
  name: string                // e.g. 'Math Study Block'
  subjectId: string           // which focus area
  projectId?: string | null   // optional project within that focus area
  targetMinutes: number       // goal for this routine block
  days: DayOfWeek[]           // which days this applies e.g. [1, 3, 5] for Mon/Wed/Fri
  color: string               // hex color for display
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
}

export interface RoutineLog {
  id: string
  routineId: string
  date: string               // ISO date YYYY-MM-DD
  actualMinutes: number      // how much was actually studied
  completed: boolean         // true if actualMinutes >= targetMinutes
  createdAt: string
}

// Hobby tracker — non-academic activities (guitar, painting, cooking, sports).
// Distinct from Subjects (academic, graded) and Habits (binary daily).
// Tracks time spent, skill progression, and milestones.
export type HobbyCategory = 'creative' | 'physical' | 'intellectual' | 'social' | 'other'

export interface Hobby {
  id: string
  name: string
  category: HobbyCategory
  color: string
  skillLevel: number // 0-100 (self-assessed or calculated from time)
  targetHours: number // optional goal
  notes: string // optional description
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
}

export interface HobbySession {
  id: string
  hobbyId: string
  durationMinutes: number
  startAt: string // ISO datetime
  endAt: string // ISO datetime
  note: string // "Practiced scales", "Finished chapter 3"
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
}

export const HOBBY_CATEGORIES: { value: HobbyCategory; label: string; color: string }[] = [
  { value: 'creative', label: 'Creative', color: '#a855f7' },
  { value: 'physical', label: 'Physical', color: '#10b981' },
  { value: 'intellectual', label: 'Intellectual', color: '#3b82f6' },
  { value: 'social', label: 'Social', color: '#f59e0b' },
  { value: 'other', label: 'Other', color: '#64748b' },
]

/** Skill level label helpers */
export function hobbySkillLevel(value: number): { label: string; color: string } {
  if (value < 25) return { label: 'Beginner', color: 'text-slate-600 dark:text-slate-400' }
  if (value < 50) return { label: 'Novice', color: 'text-blue-600 dark:text-blue-400' }
  if (value < 75) return { label: 'Intermediate', color: 'text-amber-600 dark:text-amber-400' }
  if (value < 90) return { label: 'Advanced', color: 'text-emerald-600 dark:text-emerald-400' }
  return { label: 'Expert', color: 'text-purple-600 dark:text-purple-400' }
}
// Study Areas — FSRS-based spaced repetition for conceptual topics

export type ReviewRating = 1 | 2 | 3 | 4  // again, hard, good, easy

export interface FsrsState {
  state: 'new' | 'learning' | 'review' | 'relearning'
  stability: number     // how long memory lasts (days)
  difficulty: number    // how hard the content is (1-10)
  lastReview: string | null  // ISO date
  nextReview: string    // ISO date — due when <= today
  interval: number      // current interval in days
  repetitions: number   // successful reviews count
}

export interface StudyArea {
  id: string
  subjectId: string
  name: string           // e.g., "Japanese particles"
  description?: string   // optional notes/links
  tags?: string[]        // e.g., ["grammar", "n5"]
  fsrs: FsrsState
  examMode?: {
    enabled: boolean
    dueDate: string      // exam date
  } | null
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
}

export interface StudyReview {
  id: string
  areaId: string
  rating: ReviewRating
  minutesSpent: number   // how long you spent reviewing
  notes?: string         // what you did during review
  reviewedAt: string     // ISO timestamp
}
