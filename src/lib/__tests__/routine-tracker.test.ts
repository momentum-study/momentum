// fake-indexeddb must be installed before `../routine-tracker` pulls in the
// Dexie singleton at module load.
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../../db/app-db'
import { revertRoutineLogsForSession, updateRoutineLogsForSession } from '../routine-tracker'
import type { Category, Routine, RoutineLog, Session, Subject } from '../../domain/types'

const SUBJECT_ID = 'subj-1'
const OTHER_SUBJECT_ID = 'subj-2'
const ROUTINE_ID = 'routine-1'
const OTHER_ROUTINE_ID = 'routine-2'

// Noon today — far from the logical-day boundary at any dayStartHour, so the
// session date is unambiguous.
function todayNoon(): Date {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  return d
}

function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function makeSession(overrides: Partial<Session> = {}): Session {
  const noon = todayNoon()
  const start = new Date(noon.getTime() - 60 * 60_000)
  return {
    id: 'session-1',
    subjectId: SUBJECT_ID,
    startAt: start.toISOString(),
    endAt: noon.toISOString(),
    durationMinutes: 60,
    source: 'timer',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

function makeRoutine(id: string, overrides: Partial<Routine> = {}): Routine {
  const now = new Date().toISOString()
  return {
    id,
    name: `Routine ${id}`,
    subjectId: SUBJECT_ID,
    // Scheduled every day at 60m so the session's day always matches.
    dayMinutes: { 0: 60, 1: 60, 2: 60, 3: 60, 4: 60, 5: 60, 6: 60 },
    color: '#3b82f6',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

beforeEach(async () => {
  // Dexie opens lazily; clearing inside the same DB keeps state isolated per test.
  await db.categories.clear()
  await db.subjects.clear()
  await db.routines.clear()
  await db.routineLogs.clear()
  await db.sessions.clear()

  const now = new Date().toISOString()
  const academic: Category = { id: 'cat-academic', name: 'Academic', scope: 'academic', color: '#3b82f6', createdAt: now, updatedAt: now }
  const subject: Subject = { id: SUBJECT_ID, categoryId: academic.id, name: 'Maths', color: '#3b82f6', createdAt: now, updatedAt: now }
  const other: Subject = { id: OTHER_SUBJECT_ID, categoryId: academic.id, name: 'Physics', color: '#8b5cf6', createdAt: now, updatedAt: now }
  await db.categories.add(academic)
  await db.subjects.bulkAdd([subject, other])
})

async function seedCompletedRoutineLog(routineId: string, minutes = 60): Promise<RoutineLog> {
  const log: RoutineLog = {
    id: `log-${routineId}`,
    routineId,
    date: localDate(todayNoon()),
    actualMinutes: minutes,
    completed: true,
    createdAt: new Date().toISOString(),
  }
  await db.routineLogs.add(log)
  return log
}

async function logFor(routineId: string): Promise<RoutineLog | undefined> {
  return db.routineLogs.where('routineId').equals(routineId).first()
}

describe('updateRoutineLogsForSession — which sessions own routine minutes', () => {
  it('credits an autoRoutine session to a matching routine', async () => {
    await db.routines.add(makeRoutine(ROUTINE_ID))
    await updateRoutineLogsForSession(makeSession({ source: 'autoRoutine', routineId: ROUTINE_ID }))

    const log = await logFor(ROUTINE_ID)
    expect(log?.actualMinutes).toBe(60)
    expect(log?.completed).toBe(true)
  })

  it('credits a session that explicitly picked a routine, regardless of source', async () => {
    await db.routines.add(makeRoutine(ROUTINE_ID))
    await updateRoutineLogsForSession(makeSession({ source: 'timer', routineId: ROUTINE_ID }))

    expect((await logFor(ROUTINE_ID))?.actualMinutes).toBe(60)
  })

  it('credits a marked-done routine session (activity source + routineId)', async () => {
    await db.routines.add(makeRoutine(ROUTINE_ID))
    await updateRoutineLogsForSession(makeSession({ source: 'activity', routineId: ROUTINE_ID }))

    expect((await logFor(ROUTINE_ID))?.actualMinutes).toBe(60)
  })

  it('never credits an activity session that did not pick a routine', async () => {
    await db.routines.add(makeRoutine(ROUTINE_ID))
    await updateRoutineLogsForSession(makeSession({ source: 'activity' }))

    expect(await logFor(ROUTINE_ID)).toBeUndefined()
  })

  it('never credits an unrelated manual session that did not pick a routine', async () => {
    await db.routines.add(makeRoutine(ROUTINE_ID))
    await updateRoutineLogsForSession(makeSession({ source: 'manual' }))

    expect(await logFor(ROUTINE_ID)).toBeUndefined()
  })
})

describe('revertRoutineLogsForSession — must mirror the credit decision', () => {
  it('does not subtract from a routine log the session never contributed to', async () => {
    await db.routines.add(makeRoutine(ROUTINE_ID))
    await seedCompletedRoutineLog(ROUTINE_ID, 60)

    // A manual session on the same subject with no routine picked. Before the
    // shared-predicate fix this fell through to auto-match and silently
    // removed 60 minutes, flipping `completed` back to false.
    await revertRoutineLogsForSession(makeSession({ source: 'manual' }))

    const log = await logFor(ROUTINE_ID)
    expect(log?.actualMinutes).toBe(60)
    expect(log?.completed).toBe(true)
  })

  it('does not subtract for a plain timer session with no routine picked', async () => {
    await db.routines.add(makeRoutine(ROUTINE_ID))
    await seedCompletedRoutineLog(ROUTINE_ID, 60)

    await revertRoutineLogsForSession(makeSession({ source: 'timer', durationMinutes: 30 }))

    expect((await logFor(ROUTINE_ID))?.actualMinutes).toBe(60)
  })

  it('does not subtract for a quickLog session with no routine picked', async () => {
    await db.routines.add(makeRoutine(ROUTINE_ID))
    await seedCompletedRoutineLog(ROUTINE_ID, 60)

    await revertRoutineLogsForSession(makeSession({ source: 'quickLog', durationMinutes: 15 }))

    expect((await logFor(ROUTINE_ID))?.actualMinutes).toBe(60)
  })

  it('does not subtract for an activity session with no routine picked', async () => {
    await db.routines.add(makeRoutine(ROUTINE_ID))
    await seedCompletedRoutineLog(ROUTINE_ID, 60)

    await revertRoutineLogsForSession(makeSession({ source: 'activity', durationMinutes: 50 }))

    expect((await logFor(ROUTINE_ID))?.actualMinutes).toBe(60)
  })

  it('subtracts only from the routine the session explicitly picked', async () => {
    await db.routines.bulkAdd([makeRoutine(ROUTINE_ID), makeRoutine(OTHER_ROUTINE_ID)])
    await seedCompletedRoutineLog(ROUTINE_ID, 60)
    await seedCompletedRoutineLog(OTHER_ROUTINE_ID, 60)

    await revertRoutineLogsForSession(makeSession({ source: 'timer', routineId: ROUTINE_ID, durationMinutes: 30 }))

    expect((await logFor(ROUTINE_ID))?.actualMinutes).toBe(30)
    // Never auto-matches the sibling routine (§10.63).
    expect((await logFor(OTHER_ROUTINE_ID))?.actualMinutes).toBe(60)
  })

  it('recomputes `completed` from the remaining minutes', async () => {
    await db.routines.add(makeRoutine(ROUTINE_ID))
    await seedCompletedRoutineLog(ROUTINE_ID, 60)

    await revertRoutineLogsForSession(makeSession({ source: 'timer', routineId: ROUTINE_ID, durationMinutes: 45 }))

    const log = await logFor(ROUTINE_ID)
    expect(log?.actualMinutes).toBe(15)
    expect(log?.completed).toBe(false)
  })
})

describe('update → revert round trip', () => {
  const cases: { label: string; session: Partial<Session> }[] = [
    { label: 'autoRoutine', session: { source: 'autoRoutine', routineId: ROUTINE_ID } },
    { label: 'timer with explicit routine', session: { source: 'timer', routineId: ROUTINE_ID } },
    { label: 'activity mark-done (activity + routineId)', session: { source: 'activity', routineId: ROUTINE_ID } },
    { label: 'activity with no routine', session: { source: 'activity' } },
    { label: 'manual with no routine', session: { source: 'manual' } },
    { label: 'timer with no routine', session: { source: 'timer' } },
    { label: 'quickLog with no routine', session: { source: 'quickLog' } },
  ]

  for (const { label, session } of cases) {
    it(`restores the prior log state for: ${label}`, async () => {
      await db.routines.bulkAdd([makeRoutine(ROUTINE_ID), makeRoutine(OTHER_ROUTINE_ID)])
      const before = await seedCompletedRoutineLog(ROUTINE_ID, 60)
      await seedCompletedRoutineLog(OTHER_ROUTINE_ID, 60)

      const full = makeSession(session)
      await updateRoutineLogsForSession(full)
      await revertRoutineLogsForSession(full)

      const restored = await logFor(ROUTINE_ID)
      expect(restored?.actualMinutes).toBe(before.actualMinutes)
      expect(restored?.completed).toBe(before.completed)
    })
  }

  it('leaves no residue when the session had created its own log', async () => {
    await db.routines.add(makeRoutine(ROUTINE_ID))

    const full = makeSession({ source: 'autoRoutine', routineId: ROUTINE_ID })
    await updateRoutineLogsForSession(full)
    expect((await logFor(ROUTINE_ID))?.actualMinutes).toBe(60)

    await revertRoutineLogsForSession(full)
    const log = await logFor(ROUTINE_ID)
    // A created-by-this-session log collapses to zero minutes rather than
    // being deleted — the routine row still renders, but nothing is credited.
    expect(log?.actualMinutes ?? 0).toBe(0)
    expect(log?.completed ?? false).toBe(false)
  })
})