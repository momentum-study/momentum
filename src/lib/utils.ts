import { format } from 'date-fns'
import type { Session, Subject, Category, Scope } from '../domain/types'
import type { Table } from 'dexie'

import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Merge Tailwind classes — handles conflicts (e.g. 'text-red-500' + 'text-blue-500' → 'text-blue-500')
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function formatMinutes(minutes: number): string {
  const m = Math.round(minutes)
  const h = Math.floor(m / 60)
  const r = m % 60
  if (h === 0) return `${r}m`
  if (r === 0) return `${h}h`
  return `${h}h ${r}m`
}

export function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}
/** Returns true if the session is not soft-deleted. */
export function isActiveSession(s: { deletedAt?: string | null }): boolean {
  return !s.deletedAt
}

/** Streak milestones (days) for display badges. */
export const STREAK_MILESTONES = [7, 14, 21, 30, 66, 100] as const

export function isoNow(): string {
  return new Date().toISOString()
}
/**
 * Soft-delete a record by setting deletedAt and updatedAt.
 * No-op if the record doesn't exist.
 */
export async function softDelete<T extends { id: string; updatedAt: string; deletedAt?: string | null }>(
  table: Table<T, string>,
  id: string,
): Promise<T | undefined> {
  const record = await table.get(id)
  if (!record) return undefined
  const now = isoNow()
  const updated = { ...record, deletedAt: now, updatedAt: now }
  await table.put(updated)
  return updated
}

/** Convert a percentage (0-100) to a letter grade. */
export function pctToGrade(pct: number): string {
  if (pct >= 85) return 'A'
  if (pct >= 75) return 'B'
  if (pct >= 65) return 'C'
  if (pct >= 50) return 'D'
  return 'F'
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


/** Returns the local date string (YYYY-MM-DD) for a given ISO timestamp.
 *  Returns '' for invalid/empty input so callers can filter safely. */
export function sessionLocalDate(isoDate: string | null | undefined): string {
  if (!isoDate) return ''
  const d = new Date(isoDate)
  if (isNaN(d.getTime())) return ''
  return format(d, 'yyyy-MM-dd')
}
