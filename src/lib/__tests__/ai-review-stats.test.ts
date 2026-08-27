import { describe, it, expect } from 'vitest'
import { calculatePeriodStats } from '../ai-review-stats'
import type { Session, Subject, Category } from '../../domain/types'

const BASE_SESSION: Session = {
  id: 's1',
  subjectId: 'sub-academic-1',
  startAt: '2026-08-25T10:00:00.000Z',
  endAt: '2026-08-25T11:00:00.000Z',
  durationMinutes: 60,
  source: 'timer',
  createdAt: '2026-08-25T10:00:00.000Z',
  updatedAt: '2026-08-25T11:00:00.000Z',
}

const ACADEMIC_SUBJECT: Subject = {
  id: 'sub-academic-1',
  categoryId: 'cat-academic',
  name: 'Mathematics',
  color: '#ff0000',
  createdAt: '',
  updatedAt: '',
}

const NON_ACADEMIC_SUBJECT: Subject = {
  id: 'sub-fun-1',
  categoryId: 'cat-fun',
  name: 'Gaming',
  color: '#0000ff',
  createdAt: '',
  updatedAt: '',
}

const ACADEMIC_CATEGORY: Category = {
  id: 'cat-academic',
  name: 'Academic',
  scope: 'academic',
  color: '#000',
  createdAt: '',
  updatedAt: '',
}

const FUN_CATEGORY: Category = {
  id: 'cat-fun',
  name: 'Non-Academic',
  scope: 'nonAcademic',
  color: '#fff',
  createdAt: '',
  updatedAt: '',
}

describe('calculatePeriodStats', () => {
  // Aug 24 2026 = Monday, Aug 30 = Sunday
  const range = {
    start: new Date('2026-08-24'),
    end: new Date('2026-08-30'),
  }

  it('splits sessions into academic and non-academic', () => {
    const academic: Session = { ...BASE_SESSION, id: 's-ac', subjectId: 'sub-academic-1', durationMinutes: 120 }
    const nonAcademic: Session = { ...BASE_SESSION, id: 's-na', subjectId: 'sub-fun-1', durationMinutes: 60 }

    const stats = calculatePeriodStats({
      weekSessions: [academic, nonAcademic],
      allSessions: [academic, nonAcademic],
      subjects: [ACADEMIC_SUBJECT, NON_ACADEMIC_SUBJECT],
      categories: [ACADEMIC_CATEGORY, FUN_CATEGORY],
      routines: [],
      routineLogs: [],
      dateRange: range,
      dailyTargetMinutes: 60,
    })

    expect(stats.academicMinutes).toBe(120)
    expect(stats.nonAcademicMinutes).toBe(60)
    expect(stats.totalMinutes).toBe(180)
    expect(stats.academicSessions).toBe(1)
    expect(stats.nonAcademicSessions).toBe(1)
  })

  it('most productive day uses academic-only minutes', () => {
    // Aug 25 (Tuesday): 120min academic + 240min non-academic = 360 total
    // Aug 26 (Wednesday): 30min academic only
    const tueAcad: Session = { ...BASE_SESSION, id: 'm1', startAt: '2026-08-25T08:00:00Z', endAt: '2026-08-25T10:00:00Z', durationMinutes: 120, subjectId: 'sub-academic-1' }
    const tueFun: Session = { ...BASE_SESSION, id: 'm2', startAt: '2026-08-25T10:00:00Z', endAt: '2026-08-25T14:00:00Z', durationMinutes: 240, subjectId: 'sub-fun-1' }
    const wedAcad: Session = { ...BASE_SESSION, id: 't1', startAt: '2026-08-26T09:00:00Z', endAt: '2026-08-26T09:30:00Z', durationMinutes: 30, subjectId: 'sub-academic-1' }

    const stats = calculatePeriodStats({
      weekSessions: [tueAcad, tueFun, wedAcad],
      allSessions: [tueAcad, tueFun, wedAcad],
      subjects: [ACADEMIC_SUBJECT, NON_ACADEMIC_SUBJECT],
      categories: [ACADEMIC_CATEGORY, FUN_CATEGORY],
      routines: [],
      routineLogs: [],
      dateRange: range,
      dailyTargetMinutes: 60,
    })

    // Most productive day should be Tuesday (120 academic, not 360 total)
    expect(stats.mostProductiveDay).toBe('Tuesday')
    expect(stats.mostProductiveDayMinutes).toBe(120)
  })

  it('daysTargetMet counts only academic time', () => {
    // Aug 25 (Tuesday): 60min academic (meets 60min target) + 120min non-academic
    const acad60: Session = { ...BASE_SESSION, id: 'd1', startAt: '2026-08-25T09:00:00Z', endAt: '2026-08-25T10:00:00Z', durationMinutes: 60, subjectId: 'sub-academic-1' }
    const fun120: Session = { ...BASE_SESSION, id: 'd2', startAt: '2026-08-25T10:00:00Z', endAt: '2026-08-25T12:00:00Z', durationMinutes: 120, subjectId: 'sub-fun-1' }

    const stats = calculatePeriodStats({
      weekSessions: [acad60, fun120],
      allSessions: [acad60, fun120],
      subjects: [ACADEMIC_SUBJECT, NON_ACADEMIC_SUBJECT],
      categories: [ACADEMIC_CATEGORY, FUN_CATEGORY],
      routines: [],
      routineLogs: [],
      dateRange: range,
      dailyTargetMinutes: 60,
    })

    // Target 60min — 60 academic minutes meets it, non-academic doesn't count
    expect(stats.daysTargetMet).toBe(1)
  })

  it('streak uses all sessions, not just filtered weekSessions', () => {
    // 3-day streak ending at Aug 30 (range end), none in weekSessions
    const sessions: Session[] = [
      { ...BASE_SESSION, id: 'p1', startAt: '2026-08-28T10:00:00Z', endAt: '2026-08-28T11:00:00Z', durationMinutes: 60, subjectId: 'sub-academic-1' },
      { ...BASE_SESSION, id: 'p2', startAt: '2026-08-29T10:00:00Z', endAt: '2026-08-29T11:00:00Z', durationMinutes: 60, subjectId: 'sub-academic-1' },
      { ...BASE_SESSION, id: 'p3', startAt: '2026-08-30T10:00:00Z', endAt: '2026-08-30T11:00:00Z', durationMinutes: 60, subjectId: 'sub-academic-1' },
    ]

    // Empty weekSessions but streak should still be 3 from allSessions
    const stats = calculatePeriodStats({
      weekSessions: [],
      allSessions: sessions,
      subjects: [ACADEMIC_SUBJECT],
      categories: [ACADEMIC_CATEGORY],
      routines: [],
      routineLogs: [],
      dateRange: range,
      dailyTargetMinutes: 60,
    })

    expect(stats.currentStreak).toBe(3)
  })
})
