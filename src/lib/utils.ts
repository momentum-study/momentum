import { format } from 'date-fns'
import type { Session, Subject, Category, Scope } from '../domain/types'

// Lightweight className joiner (no extra deps)
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function formatHours(minutes: number): string {
  return (minutes / 60).toFixed(1)
}

export function isoNow(): string {
  return new Date().toISOString()
}

/** Convert a percentage (0-100) to a letter grade. */
export function pctToGrade(pct: number): string {
  if (pct >= 85) return 'A'
  if (pct >= 75) return 'B'
  if (pct >= 65) return 'C'
  if (pct >= 50) return 'D'
  return 'E'
}

/** Get color class for a letter grade. */
export function gradeColor(grade: string): string {
  if (grade.startsWith('A')) return 'text-green-600 dark:text-green-400'
  if (grade.startsWith('B')) return 'text-blue-600 dark:text-blue-400'
  if (grade.startsWith('C')) return 'text-yellow-600 dark:text-yellow-400'
  if (grade.startsWith('D')) return 'text-orange-600 dark:text-orange-400'
  return 'text-red-600 dark:text-red-400'
}

/** Resolve the scope of a session by looking up its subject → category chain. */
export function getSessionScope(
  session: Session,
  subjects: Subject[],
  categories: Category[]
): Scope | null {
  const subject = subjects.find((s) => s.id === session.subjectId)
  if (!subject) return null
  const category = categories.find((c) => c.id === subject.categoryId)
  return category?.scope ?? null
}


/** Returns the local date string (YYYY-MM-DD) for a given ISO timestamp. */
export function sessionLocalDate(isoDate: string): string {
  return format(new Date(isoDate), 'yyyy-MM-dd')
}
