import Dexie, { type Table } from 'dexie'
import type {
  Assignment,
  Category,
  Habit,
  HabitLog,
  Hobby,
  HobbySession,
  Mark,
  Project,
  ProgressLog,
  Routine,
  RoutineLog,
  Session,
  StreakDay,
  Subject,
  StudyArea,
  StudyReview,
} from '../domain/types'

const SEED_KEY = 'momentum-seeded'

const SEED_CATEGORIES: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { name: 'Academic', scope: 'academic', color: '#3b82f6' },
  { name: 'Hobbies', scope: 'nonAcademic', color: '#10b981' },
  { name: 'Miscellaneous', scope: 'nonAcademic', color: '#f59e0b' },
]

export class AppDB extends Dexie {
  categories!: Table<Category, string>
  subjects!: Table<Subject, string>
  projects!: Table<Project, string>
  sessions!: Table<Session, string>
  progressLogs!: Table<ProgressLog, string>
  marks!: Table<Mark, string>
  assignments!: Table<Assignment, string>
  habits!: Table<Habit, string>
  habitLogs!: Table<HabitLog, string>
  streakDays!: Table<StreakDay, string>
  routines!: Table<Routine, string>
  routineLogs!: Table<RoutineLog, string>
  hobbies!: Table<Hobby, string>
  hobbySessions!: Table<HobbySession, string>
  studyAreas!: Table<StudyArea, string>
  studyReviews!: Table<StudyReview, string>

  constructor() {
    super('study-app')
    this.version(1).stores({
      categories: 'id, scope, name',
      subjects: 'id, categoryId, name',
      projects: 'id, subjectId, name',
      tasks: 'id, projectId, orderIndex',
      sessions: 'id, subjectId, projectId, startAt',
      progressLogs: 'id, subjectId, loggedAt',
    })
    this.version(2).stores({
      marks: 'id, subjectId, date',
      assignments: 'id, subjectId, dueDate, completed',
      habits: 'id, kind',
      habitLogs: 'id, habitId, date',
      streakDays: 'id, totalMinutes, goalMet',
    })
    // v3: add letterGrade index for filter/sort (no schema change needed, but bump to be safe)
    this.version(4).stores({
      marks: 'id, subjectId, date, letterGrade',
      assignments: 'id, subjectId, dueDate, completed, category',
    })
    this.version(6).stores({
      sessions: 'id, subjectId, projectId, assignmentId, startAt',
    })
    this.version(7).stores({
      routines: 'id, subjectId, name',
      routineLogs: 'id, routineId, date',
    })
    this.version(8).stores({
      hobbies: 'id, category, name',
      hobbySessions: 'id, hobbyId, startAt',
    })
    this.version(9).stores({
      studyAreas: 'id, subjectId, deletedAt',
      studyReviews: 'id, areaId, reviewedAt',
    })
  }
}

export const db = new AppDB()

/** Seed default categories on first launch. Safe to call multiple times. */
export async function seedDefaults() {
  if (typeof localStorage === 'undefined') return
  if (localStorage.getItem(SEED_KEY)) return

  const existing = await db.categories.count()
  if (existing > 0) {
    localStorage.setItem(SEED_KEY, '1')
    return
  }

  const now = new Date().toISOString()
  await db.categories.bulkAdd(
    SEED_CATEGORIES.map((c, i) => ({
      ...c,
      id: `cat-seed-${i}`,
      createdAt: now,
      updatedAt: now,
    }))
  )
  localStorage.setItem(SEED_KEY, '1')
}
