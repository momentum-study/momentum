// Compact "Today's Checklist" widget — shows today's routines and activities
import { Checkbox } from '../../components/ui/Checkbox'
// as a single list with checkmark/skip actions. Optimistic UI updates.
import { useMemo, useState, useCallback } from 'react'
import { format } from 'date-fns'
import { v4 as uuid } from 'uuid'
import { useData } from '../../app/providers'
import { db } from '../../db/app-db'
import { isoNow, toLocalDateString, softDelete } from '../../lib/utils'
import { useUndo } from '../../lib/use-undo'
import { useSessionSync } from '../../lib/use-session-sync'
import { updateStreakDayForSession, revertStreakDayForSession } from '../../lib/routine-tracker'
import { sessionIdFor } from '../../lib/timer-persistence'
import type { Routine, Activity, Assignment, RoutineLog, ActivityLog, DayOfWeek, Session } from '../../domain/types'

type Row =
  | { kind: 'routine'; data: Routine; completed: boolean; skipped: boolean; log?: RoutineLog }
  | { kind: 'activity'; data: Activity; completed: boolean; skipped: boolean; log?: ActivityLog }
  | { kind: 'assignment'; data: Assignment; completed: boolean; skipped: false }
export function TodayChecklist() {
  const { data, mutate } = useData()
  const { push } = useUndo()
  const { syncSession } = useSessionSync()
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const todayDow = new Date().getDay() as DayOfWeek
  // When true, checking off also creates a study session (default: false per
  // user request — study time is typically logged via the timer).
  const [logTime, setLogTime] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskSubjectId, setTaskSubjectId] = useState('')

  const rows = useMemo<Row[]>(() => {
    const rlogs = data.routineLogs.filter(l => l.date === todayStr)
    const alogs = data.activityLogs.filter(l => l.date === todayStr)
    const rRows: Row[] = data.routines
      .filter(r => !r.deletedAt && (r.dayMinutes[todayDow] ?? 0) > 0)
      .map(r => {
        const log = rlogs.find(l => l.routineId === r.id)
        // "Skipped" only when the user explicitly skipped (log has no actual
        // minutes). A routine with partial study progress (actualMinutes > 0)
        // is neither completed nor skipped — do not cross it out.
        return { kind: 'routine' as const, data: r, completed: log?.completed ?? false, skipped: !!log && !log.completed && (log.actualMinutes ?? 0) === 0, log }
      })
    const aRows: Row[] = data.activities
      .filter(a => !a.deletedAt && (a.dayMinutes[todayDow] ?? 0) > 0)
      .map(a => {
        const log = alogs.find(l => l.activityId === a.id)
        return { kind: 'activity' as const, data: a, completed: log?.status === 'completed', skipped: log?.status === 'skipped', log }
      })
    const tRows: Row[] = data.assignments
      .filter(a => !a.deletedAt && a.dueDate === todayStr)
      .map(a => ({ kind: 'assignment' as const, data: a, completed: a.completed, skipped: false }))
    return [...rRows, ...aRows, ...tRows].sort((a, b) => {
      // Pending first, then by target minutes desc
      const aDone = a.completed || a.skipped ? 1 : 0
      const bDone = b.completed || b.skipped ? 1 : 0
      if (aDone !== bDone) return aDone - bDone
      const aMins = a.kind === 'assignment' ? 0 : (a.data.dayMinutes[todayDow] ?? 0)
      const bMins = b.kind === 'assignment' ? 0 : (b.data.dayMinutes[todayDow] ?? 0)
      return bMins - aMins
    })
  }, [data.routines, data.routineLogs, data.activities, data.activityLogs, data.assignments, todayStr, todayDow])
  const addTask = useCallback(async () => {
    const title = taskTitle.trim()
    if (!title || !taskSubjectId) return
    const now = isoNow()
    const a: Assignment = { id: uuid(), subjectId: taskSubjectId, title, dueDate: todayStr, category: 'miscellaneous', weight: 0, completed: false, createdAt: now, updatedAt: now }
    await db.assignments.add(a)
    mutate(prev => ({ ...prev, assignments: [...prev.assignments, a] }))
    setTaskTitle('')
  }, [taskTitle, taskSubjectId, todayStr, mutate])
  const toggleAssignment = useCallback((row: Extract<Row, { kind: 'assignment' }>) => {
    const completed = !row.data.completed
    const updated = { ...row.data, completed, updatedAt: isoNow() }
    mutate(prev => ({ ...prev, assignments: prev.assignments.map(a => a.id === updated.id ? updated : a) }))
    void db.assignments.put(updated).catch(err => console.error('Failed to toggle assignment:', err))
  }, [mutate])
  const markDone = useCallback((row: Row) => {
    if (row.kind === 'assignment') { toggleAssignment(row); return }
    if (row.kind === 'routine') {
      const routine = row.data
      const mins = routine.dayMinutes[todayDow] ?? 0
      const existingMinutes = row.log?.actualMinutes ?? 0
      const gap = Math.max(0, mins - existingMinutes)
      const logId = row.log?.id ?? uuid()
      const log: RoutineLog = {
        id: logId,
        routineId: routine.id,
        date: todayStr,
        actualMinutes: existingMinutes + gap,
        completed: true,
        createdAt: row.log?.createdAt ?? isoNow(),
      }
      const session: Session | null = logTime && routine.subjectId && gap > 0
        ? {
            id: sessionIdFor(new Date(Date.now() - gap * 60_000).toISOString(), routine.subjectId, gap),
            subjectId: routine.subjectId,
            projectId: routine.projectId ?? null,
            routineId: routine.id,
            startAt: new Date(Date.now() - gap * 60_000).toISOString(),
            endAt: new Date().toISOString(),
            durationMinutes: gap,
            source: 'autoRoutine',
            createdAt: isoNow(),
            updatedAt: isoNow(),
          }
        : null
      mutate(prev => ({
        ...prev,
        ...(session ? { sessions: [...prev.sessions, session] } : {}),
        routineLogs: row.log
          ? prev.routineLogs.map(l => l.id === logId ? log : l)
          : [...prev.routineLogs, log],
      }))
      void db.routineLogs.put(log).catch(err => console.error('Failed to save routine log:', err))
      if (session) {
        void db.sessions.put(session).catch(err => console.error('Failed to save session:', err))
        const subjectName = data.subjects.find(s => s.id === routine.subjectId)?.name ?? 'Unknown'
        syncSession(session, subjectName)
        void updateStreakDayForSession(session).catch(err => console.error('Failed to update streak:', err))
      }
      push({
        description: session ? `Logged ${session.durationMinutes}m (gap) for ${routine.name}` : `Completed ${routine.name}`,
        undo: async () => {
          if (session) await softDelete(db.sessions, session.id)
          if (row.log) {
            // Restore the prior log (partial timer progress)
            await db.routineLogs.put(row.log)
            mutate(prev => ({ ...prev, routineLogs: prev.routineLogs.map(l => l.id === row.log!.id ? row.log! : l), ...(session ? { sessions: prev.sessions.filter(s => s.id !== session.id) } : {}) }))
          } else {
            await db.routineLogs.delete(logId)
            mutate(prev => ({ ...prev, routineLogs: prev.routineLogs.filter(l => l.id !== logId), ...(session ? { sessions: prev.sessions.filter(s => s.id !== session.id) } : {}) }))
          }
        },
        redo: async () => {
          if (session) await db.sessions.put(session)
          await db.routineLogs.put(log)
          mutate(prev => ({
            ...prev,
            ...(session ? { sessions: [...prev.sessions, session] } : {}),
            routineLogs: row.log
              ? prev.routineLogs.map(l => l.id === logId ? log : l)
              : [...prev.routineLogs, log],
          }))
        },
      })
    } else {
      const activity = row.data
      const mins = activity.dayMinutes[todayDow] ?? activity.duration ?? 0
      const log: ActivityLog = {
        id: row.log?.id ?? uuid(),
        activityId: activity.id,
        date: todayStr,
        status: 'completed',
        actualMinutes: mins,
        createdAt: row.log?.createdAt ?? isoNow(),
      }
      mutate(prev => ({
        ...prev,
        activityLogs: row.log
          ? prev.activityLogs.map(l => l.id === log.id ? log : l)
          : [...prev.activityLogs, log],
      }))
      void db.activityLogs.put(log).catch(err => console.error('Failed to save activity log:', err))
      push({
        description: `Completed ${activity.name}`,
        undo: async () => {
          await db.activityLogs.delete(log.id)
          mutate(prev => ({
            ...prev,
            activityLogs: row.log ? prev.activityLogs : prev.activityLogs.filter(l => l.id !== log.id),
          }))
        },
        redo: async () => {
          await db.activityLogs.put(log)
          mutate(prev => ({
            ...prev,
            activityLogs: row.log
              ? prev.activityLogs.map(l => l.id === log.id ? log : l)
              : [...prev.activityLogs, log],
          }))
        },
      })
    }
  }, [logTime, todayDow, todayStr, data, mutate, push, syncSession])

  function markSkipped(row: Row) {
    if (row.skipped || row.completed || row.kind === 'assignment') return
    if (row.kind === 'routine') {
      const prevLog = row.log
      const log: RoutineLog = {
        id: prevLog?.id ?? uuid(),
        routineId: row.data.id,
        date: todayStr,
        actualMinutes: 0,
        completed: false,
        createdAt: prevLog?.createdAt ?? isoNow(),
      }
      mutate(prev => ({
        ...prev,
        routineLogs: prevLog
          ? prev.routineLogs.map(l => l.id === log.id ? log : l)
          : [...prev.routineLogs, log],
      }))
      void db.routineLogs.put(log).catch(err => console.error('Failed to save routine log:', err))
      push({
        description: `Skipped ${row.data.name}`,
        undo: async () => {
          if (prevLog) {
            await db.routineLogs.put(prevLog)
            mutate(prev => ({ ...prev, routineLogs: prev.routineLogs.map(l => l.id === prevLog.id ? prevLog : l) }))
          } else {
            await db.routineLogs.delete(log.id)
            mutate(prev => ({ ...prev, routineLogs: prev.routineLogs.filter(l => l.id !== log.id) }))
          }
        },
        redo: async () => {
          await db.routineLogs.put(log)
          mutate(prev => ({
            ...prev,
            routineLogs: prevLog
              ? prev.routineLogs.map(l => l.id === log.id ? log : l)
              : prev.routineLogs.some(l => l.id === log.id)
              ? prev.routineLogs.map(l => l.id === log.id ? log : l)
              : [...prev.routineLogs, log],
          }))
        },
      })
    } else {
      const log: ActivityLog = {
        id: uuid(),
        activityId: row.data.id,
        date: todayStr,
        status: 'skipped',
        createdAt: isoNow(),
      }
      mutate(prev => ({ ...prev, activityLogs: [...prev.activityLogs, log] }))
      void db.activityLogs.add(log).catch(err => console.error('Failed to save activity log:', err))
      push({
        description: `Skipped ${row.data.name}`,
        undo: async () => {
          await db.activityLogs.delete(log.id)
          mutate(prev => ({ ...prev, activityLogs: prev.activityLogs.filter(l => l.id !== log.id) }))
        },
        redo: async () => {
          await db.activityLogs.add(log)
          mutate(prev => ({ ...prev, activityLogs: [...prev.activityLogs, log] }))
        },
      })
    }
  }
  function untick(row: Row) {
    if (row.kind === 'assignment') return
    if (!row.log) return
    if (row.kind === 'routine') {
      const removedLog = row.log
      // Only target the auto-generated markDone session (source='autoRoutine'),
      // NOT real timer sessions that just happen to share the routineId.
      const session = data.sessions.find(
        s => s.routineId === row.data.id && s.source === 'autoRoutine' && toLocalDateString(s.startAt) === todayStr
      ) ?? null
      mutate(prev => ({
        ...prev,
        routineLogs: prev.routineLogs.filter(l => l.id !== removedLog.id),
        ...(session ? { sessions: prev.sessions.filter(s => s.id !== session.id) } : {}),
      }))
      void db.routineLogs.delete(removedLog.id).catch(err => console.error('Failed to delete routine log:', err))
      if (session) {
        void softDelete(db.sessions, session.id).catch(err => console.error('Failed to delete session:', err))
        void revertStreakDayForSession(session).catch(err => console.error('Failed to revert streak:', err))
      }
      push({
        description: `Unmarked ${row.data.name}`,
        undo: async () => {
          await db.routineLogs.put(removedLog)
          if (session) await db.sessions.put(session)
          mutate(prev => ({
            ...prev,
            routineLogs: prev.routineLogs.some(l => l.id === removedLog.id)
              ? prev.routineLogs
              : [...prev.routineLogs, removedLog],
            ...(session ? { sessions: prev.sessions.some(s => s.id === session.id) ? prev.sessions : [...prev.sessions, session] } : {}),
          }))
        },
        redo: async () => {
          await db.routineLogs.delete(removedLog.id)
          if (session) await softDelete(db.sessions, session.id)
          mutate(prev => ({
            ...prev,
            routineLogs: prev.routineLogs.filter(l => l.id !== removedLog.id),
            ...(session ? { sessions: prev.sessions.filter(s => s.id !== session.id) } : {}),
          }))
        },
      })
    } else {
      const removedLog = row.log
      const activitySubjectId = row.data.subjectId
      const mins = removedLog.actualMinutes ?? 0
      // Prefer the persisted sessionId on the log (H2 fix); fall back to the
      // old derivation for logs created before this field was added.
      const session = removedLog.sessionId
        ? data.sessions.find(s => s.id === removedLog.sessionId) ?? null
        : (activitySubjectId && mins > 0
          ? data.sessions.find(s => s.id === sessionIdFor(removedLog.createdAt, activitySubjectId, mins))
          : null) ?? null
      mutate(prev => ({
        ...prev,
        activityLogs: prev.activityLogs.filter(l => l.id !== removedLog.id),
        ...(session ? { sessions: prev.sessions.filter(s => s.id !== session.id) } : {}),
      }))
      void db.activityLogs.delete(removedLog.id).catch(err => console.error('Failed to delete activity log:', err))
      if (session) {
        void softDelete(db.sessions, session.id).catch(err => console.error('Failed to delete session:', err))
        void revertStreakDayForSession(session).catch(err => console.error('Failed to revert streak:', err))
      }
      push({
        description: `Unmarked ${row.data.name}`,
        undo: async () => {
          await db.activityLogs.put(removedLog)
          if (session) await db.sessions.put(session)
          mutate(prev => ({
            ...prev,
            activityLogs: prev.activityLogs.some(l => l.id === removedLog.id)
              ? prev.activityLogs
              : [...prev.activityLogs, removedLog],
            ...(session ? { sessions: prev.sessions.some(s => s.id === session.id) ? prev.sessions : [...prev.sessions, session] } : {}),
          }))
        },
        redo: async () => {
          await db.activityLogs.delete(removedLog.id)
          if (session) await softDelete(db.sessions, session.id)
          mutate(prev => ({
            ...prev,
            activityLogs: prev.activityLogs.filter(l => l.id !== removedLog.id),
            ...(session ? { sessions: prev.sessions.filter(s => s.id !== session.id) } : {}),
          }))
        },
      })
    }
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <div className="px-3 py-4 text-center text-xs text-slate-500 dark:text-slate-400">Nothing scheduled for today</div>
        <form className="flex items-center gap-1 border-t border-slate-100 px-3 py-2 dark:border-slate-700" onSubmit={(e) => { e.preventDefault(); void addTask() }}>
          <input className="input min-w-0 flex-1 py-1 text-xs" placeholder="Add today's task..." value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} aria-label="Task title" />
          <select className="input w-20 py-1 text-xs" value={taskSubjectId} onChange={(e) => setTaskSubjectId(e.target.value)} aria-label="Focus area"><option value="">Focus</option>{data.subjects.filter(s => !s.deletedAt).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <button type="submit" className="rounded bg-primary-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50" disabled={!taskTitle.trim() || !taskSubjectId}>Add</button>
        </form>
      </div>
    )
  }

  const completed = rows.filter(r => r.completed || r.skipped).length

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-1.5 text-xs dark:border-slate-700">
        <span className="font-medium text-slate-500 dark:text-slate-400">
          {completed} / {rows.length} done
        </span>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500 select-none cursor-pointer">
            <Checkbox
              checked={logTime}
              onChange={(e) => setLogTime(e.target.checked)}
            />
            Log time
          </label>
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div
              className="h-full bg-primary-500 transition-all"
              style={{ width: `${(completed / rows.length) * 100}%` }}
            />
          </div>
        </div>
      </div>
      <ul className="flex-1 overflow-y-auto">
        {rows.map(row => {
          const isDone = row.completed || row.skipped
          const name = row.kind === 'assignment' ? row.data.title : row.data.name
          return (
            <li
              key={`${row.kind}-${row.data.id}`}
              className="flex items-center gap-2 border-b border-slate-50 px-3 py-1.5 last:border-b-0 dark:border-slate-800"
            >
              <button
                onClick={() => (isDone ? untick(row) : markDone(row))}
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                  row.completed
                    ? 'border-green-500 bg-green-500 text-white hover:opacity-80'
                    : row.skipped
                    ? 'border-slate-300 bg-slate-200 hover:opacity-80 dark:border-slate-600 dark:bg-slate-700'
                    : 'border-slate-300 hover:border-primary-500 dark:border-slate-600'
                }`}
                title={isDone ? 'Unmark' : 'Mark done'}
                aria-label={row.completed ? 'Completed (click to unmark)' : row.skipped ? 'Skipped (click to unmark)' : 'Mark done'}
              >
                {row.completed && (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {row.skipped && (
                  <span className="text-[8px] font-bold text-slate-500">-</span>
                )}
              </button>
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  isDone ? 'opacity-40' : ''
                }`}
                style={{ backgroundColor: row.kind === 'assignment' ? (data.subjects.find(s => s.id === row.data.subjectId)?.color || '#6366f1') : (row.data.color || '#6366f1') }}
              />
              <span
                className={`flex-1 truncate text-sm ${
                  isDone ? 'text-slate-400 line-through dark:text-slate-500' : 'text-slate-700 dark:text-slate-300'
                }`}
              >
                {name}
              </span>
              <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                {row.kind === 'routine' ? `${row.data.dayMinutes[todayDow]}m` : row.kind === 'assignment' ? 'task' : '✓'}
              </span>
              {!isDone && row.kind !== 'assignment' && (
                <button
                  onClick={() => markSkipped(row)}
                  className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                  aria-label="Skip"
                >
                  Skip
                </button>
              )}
            </li>
          )
        })}
        <li key="add-task-form" className="border-b-0">
          <form className="flex items-center gap-1 py-1" onSubmit={(e) => { e.preventDefault(); void addTask() }}>
            <input className="input min-w-0 flex-1 py-1 text-xs" placeholder="Add today's task..." value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} aria-label="Task title" />
            <select className="input w-20 py-1 text-xs" value={taskSubjectId} onChange={(e) => setTaskSubjectId(e.target.value)} aria-label="Focus area">
              <option value="">Focus</option>
              {data.subjects.filter(s => !s.deletedAt).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button type="submit" className="rounded bg-primary-600 px-2 py-1 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50" disabled={!taskTitle.trim() || !taskSubjectId}>Add</button>
          </form>
        </li>
      </ul>
    </div>
  )
}
