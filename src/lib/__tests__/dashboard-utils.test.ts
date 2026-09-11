import { describe, it, expect } from 'vitest'
import { getSessionScope } from '../utils'
import type { Session, Subject, Category } from '../../domain/types'

const academicCategory: Category = {
  id: 'cat-academic',
  name: 'Academic',
  scope: 'academic',
  color: '#3b82f6',
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
}
const nonAcademicCategory: Category = {
  id: 'cat-non-academic',
  name: 'Wellness',
  scope: 'nonAcademic',
  color: '#10b981',
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
}
const academicSubject: Subject = {
  id: 'sub-academic',
  name: 'Math',
  categoryId: 'cat-academic',
  color: '#3b82f6',
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
}
const nonAcademicSubject: Subject = {
  id: 'sub-non-academic',
  name: 'Meditation',
  categoryId: 'cat-non-academic',
  color: '#10b981',
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
}
const subjects = [academicSubject, nonAcademicSubject]
const categories = [academicCategory, nonAcademicCategory]

function makeSession(subjectId: string): Session {
  return {
    id: 's1',
    subjectId,
    startAt: '2026-08-30T10:00:00Z',
    endAt: '2026-08-30T10:30:00Z',
    durationMinutes: 30,
    source: 'timer',
    createdAt: '2026-08-30T10:30:00Z',
    updatedAt: '2026-08-30T10:30:00Z',
  }
}

describe('getSessionScope', () => {
  it('returns academic for academic subject', () => {
    expect(getSessionScope(makeSession('sub-academic'), subjects, categories)).toBe('academic')
  })

  it('returns nonAcademic for non-academic subject', () => {
    expect(getSessionScope(makeSession('sub-non-academic'), subjects, categories)).toBe('nonAcademic')
  })

  it('returns null for unknown subject', () => {
    expect(getSessionScope(makeSession('unknown-subject'), subjects, categories)).toBeNull()
  })

  it('returns null for subject with unknown category', () => {
    const orphanSubject: Subject = {
      id: 'sub-orphan',
      name: 'Orphan',
      categoryId: 'cat-missing',
      color: '#94a3b8',
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-01T00:00:00Z',
    }
    expect(getSessionScope(makeSession('sub-orphan'), [...subjects, orphanSubject], categories)).toBeNull()
  })
})