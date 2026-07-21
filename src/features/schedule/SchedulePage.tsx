import { useState, useMemo } from 'react'
import { format } from 'date-fns'
import { useData } from '../../app/providers'
import { useUndo } from '../../lib/use-undo'
import { db } from '../../db/app-db'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader, CardTitle } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { cn, isoNow } from '../../lib/utils'
import { v4 as uuid } from 'uuid'
import type { Routine, RoutineLog, Activity, ActivityLog, DayOfWeek, Session } from '../../domain/types'
import { useSessionSync } from '../../lib/use-session-sync'

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const
const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
const DEFAULT_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#ef4444']

function todayKey() { return format(new Date(), 'yyyy-MM-dd') }
function todayDow() { return new Date().getDay() as DayOfWeek }

function timeUntil(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number)
  const target = new Date()
  target.setHours(h, m, 0, 0)
  const diffMs = target.getTime() - Date.now()
  const diffMin = Math.round(diffMs / 60000)
  if (diffMin > 0) {
    const hr = Math.floor(diffMin / 60)
    const mn = diffMin % 60
    return `Starts in ${hr > 0 ? `${hr}h ` : ''}${mn}m`
  } else if (diffMin > -60) {
    return `Started ${-diffMin}m ago`
  }
  return `Ended ${Math.abs(Math.floor(diffMin / 60))}h ${Math.abs(diffMin) % 60}m ago`
}

export function SchedulePage() {
  const { data, loadData } = useData()
  const { push } = useUndo()
  const { syncSession } = useSessionSync()

  const [tab, setTab] = useState<'today' | 'plan'>('today')
  const [routineEditing, setRoutineEditing] = useState<Routine | null>(null)
  const [cellEditing, setCellEditing] = useState<{ routineId: string; dow: DayOfWeek; minutes: string } | null>(null)
  const [logCustomFor, setLogCustomFor] = useState<string | null>(null)
  const [customMinutes, setCustomMinutes] = useState('')
  const [addRoutineOpen, setAddRoutineOpen] = useState(false)
  const [addActivityOpen, setAddActivityOpen] = useState(false)

  const subjects = useMemo(() => data.subjects.filter(s => !s.deletedAt).sort((a, b) => a.name.localeCompare(b.name)), [data.subjects])
  const subjectsMap = useMemo(() => new Map(subjects.map(s => [s.id, s])), [subjects])
  const routines = useMemo(() => data.routines.filter(r => !r.deletedAt).sort((a, b) => a.name.localeCompare(b.name)), [data.routines])
  const activities = useMemo(() => data.activities.filter(a => !a.deletedAt).sort((a, b) => a.name.localeCompare(b.name)), [data.activities])
  const routineLogs = useMemo(() => data.routineLogs, [data.routineLogs])
  const activityLogs = useMemo(() => data.activityLogs, [data.activityLogs])

  const todayStr = todayKey()
  const dow = todayDow()

  const todaysRoutines = useMemo(
    () => routines.filter(r => (r.dayMinutes[dow] ?? 0) > 0).sort((a, b) => {
      const aSubject = subjectsMap.get(a.subjectId)?.name ?? ''
      const bSubject = subjectsMap.get(b.subjectId)?.name ?? ''
      return aSubject.localeCompare(bSubject)
    }),
    [routines, subjectsMap, dow]
  )

  const todaysActivities = useMemo(
    () => activities.filter(a => (a.dayMinutes[dow] ?? 0) > 0 || a.scheduledTime).sort((a, b) => {
      const at = a.scheduledTime ?? '99:99'
      const bt = b.scheduledTime ?? '99:99'
      return at.localeCompare(bt)
    }),
    [activities, dow]
  )

  function getRoutineLogForToday(routineId: string) {
    return routineLogs.find(l => l.routineId === routineId && l.date === todayStr)
  }

  function getActivityLogForToday(activityId: string) {
    return activityLogs.find(l => l.activityId === activityId && l.date === todayStr)
  }

  async function buildSession(routine: Routine, mins: number): Promise<Session> {
    const now = new Date()
    const startAt = new Date(now.getTime() - mins * 60 * 1000).toISOString()
    return {
      id: uuid(),
      subjectId: routine.subjectId,
      projectId: routine.projectId ?? null,
      routineId: routine.id,
      startAt,
      endAt: now.toISOString(),
      durationMinutes: mins,
      source: 'autoRoutine',
      createdAt: isoNow(),
      updatedAt: isoNow(),
    }
  }

  async function markDone(routine: Routine) {
    const mins = routine.dayMinutes[dow] ?? 0
    if (mins <= 0) return
    const session = await buildSession(routine, mins)
    await db.sessions.add(session)
    const subjectName = subjectsMap.get(routine.subjectId)?.name ?? 'Unknown'
    syncSession(session, subjectName)
    const existingLog = getRoutineLogForToday(routine.id)
    const logId = existingLog?.id ?? uuid()
    const log: RoutineLog = {
      id: logId,
      routineId: routine.id,
      date: todayStr,
      actualMinutes: mins,
      completed: true,
      createdAt: existingLog?.createdAt ?? isoNow(),
    }
    await db.routineLogs.put(log)
    await loadData()
    push({
      description: `Logged ${mins}m for ${routine.name}`,
      undo: async () => {
        await db.sessions.delete(session.id)
        if (!existingLog) await db.routineLogs.delete(logId)
        await loadData()
      },
      redo: async () => {
        await db.sessions.add(session)
        await db.routineLogs.put(log)
        await loadData()
      },
    })
  }

  async function logCustom(routine: Routine, mins: number) {
    if (mins <= 0) return
    const session = await buildSession(routine, mins)
    await db.sessions.add(session)
    const subjectName = subjectsMap.get(routine.subjectId)?.name ?? 'Unknown'
    syncSession(session, subjectName)
    const existingLog = getRoutineLogForToday(routine.id)
    const logId = existingLog?.id ?? uuid()
    const targetMins = routine.dayMinutes[dow] ?? 0
    const log: RoutineLog = {
      id: logId,
      routineId: routine.id,
      date: todayStr,
      actualMinutes: mins,
      completed: mins >= targetMins,
      createdAt: existingLog?.createdAt ?? isoNow(),
    }
    await db.routineLogs.put(log)
    await loadData()
    push({
      description: `Logged ${mins}m for ${routine.name}`,
      undo: async () => {
        await db.sessions.delete(session.id)
        if (!existingLog) await db.routineLogs.delete(logId)
        await loadData()
      },
      redo: async () => {
        await db.sessions.add(session)
        await db.routineLogs.put(log)
        await loadData()
      },
    })
  }

  async function skipRoutine(routine: Routine) {
    const existingLog = getRoutineLogForToday(routine.id)
    if (existingLog) return
    const log: RoutineLog = {
      id: uuid(),
      routineId: routine.id,
      date: todayStr,
      actualMinutes: 0,
      completed: false,
      createdAt: isoNow(),
    }
    await db.routineLogs.add(log)
    await loadData()
    push({
      description: `Skipped ${routine.name}`,
      undo: async () => { await db.routineLogs.delete(log.id); await loadData() },
      redo: async () => { await db.routineLogs.add(log); await loadData() },
    })
  }

  async function skipActivity(activity: Activity) {
    const existingLog = getActivityLogForToday(activity.id)
    if (existingLog) return
    const log: ActivityLog = {
      id: uuid(),
      activityId: activity.id,
      date: todayStr,
      status: 'skipped',
      createdAt: isoNow(),
    }
    await db.activityLogs.add(log)
    await loadData()
    push({
      description: `Skipped ${activity.name}`,
      undo: async () => { await db.activityLogs.delete(log.id); await loadData() },
      redo: async () => { await db.activityLogs.add(log); await loadData() },
    })
  }

  async function attendActivity(activity: Activity) {
    const existingLog = getActivityLogForToday(activity.id)
    if (existingLog) return
    const mins = activity.dayMinutes[dow] ?? 0
    const log: ActivityLog = {
      id: uuid(),
      activityId: activity.id,
      date: todayStr,
      status: 'completed',
      actualMinutes: mins,
      createdAt: isoNow(),
    }
    await db.activityLogs.add(log)
    let session: Session | null = null
    if (activity.subjectId && mins > 0) {
      session = {
        id: uuid(),
        subjectId: activity.subjectId,
        startAt: new Date(Date.now() - mins * 60 * 1000).toISOString(),
        endAt: new Date().toISOString(),
        durationMinutes: mins,
        source: 'autoRoutine',
        createdAt: isoNow(),
        updatedAt: isoNow(),
      }
      await db.sessions.add(session)
      const subjectName = subjectsMap.get(activity.subjectId)?.name ?? 'Unknown'
      syncSession(session, subjectName)
    }
    await loadData()
    push({
      description: `Attended ${activity.name}`,
      undo: async () => {
        await db.activityLogs.delete(log.id)
        if (session) await db.sessions.delete(session.id)
        await loadData()
      },
      redo: async () => {
        await db.activityLogs.add(log)
        if (session) await db.sessions.add(session)
        await loadData()
      },
    })
  }

  async function saveRoutine(updated: Routine) {
    await db.routines.put(updated)
    await loadData()
  }

  async function deleteRoutine(routine: Routine) {
    await db.routines.update(routine.id, { deletedAt: isoNow(), updatedAt: isoNow() })
    await loadData()
  }

  async function saveActivity(updated: Activity) {
    await db.activities.put(updated)
    await loadData()
  }



  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex space-x-1 rounded-lg border border-slate-200 dark:border-slate-700 p-1 bg-white dark:bg-slate-800">
          <button
            onClick={() => setTab('today')}
            className={cn(
              'px-4 py-1.5 text-sm font-medium rounded-md transition-colors',
              tab === 'today' ? 'bg-primary-600 text-white' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
            )}
          >Today</button>
          <button
            onClick={() => setTab('plan')}
            className={cn(
              'px-4 py-1.5 text-sm font-medium rounded-md transition-colors',
              tab === 'plan' ? 'bg-primary-600 text-white' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
            )}
          >Weekly Plan</button>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setAddRoutineOpen(true)}>+ Routine</Button>
          <Button size="sm" variant="secondary" onClick={() => setAddActivityOpen(true)}>+ Activity</Button>
        </div>
      </div>

      {tab === 'today' && (
        <div className="space-y-4">
          {todaysActivities.length === 0 && todaysRoutines.length === 0 && (
            <EmptyState title="Nothing scheduled" description="No routines or activities for today. Use the buttons above to add some." />
          )}

          {todaysActivities.map(activity => (
            <ActivityCard
              key={activity.id}
              activity={activity}
              subjectName={activity.subjectId ? subjectsMap.get(activity.subjectId)?.name ?? null : null}
              existingLog={getActivityLogForToday(activity.id)}
              onAttended={() => attendActivity(activity)}
              onSkip={() => skipActivity(activity)}
            />
          ))}

          {todaysRoutines.map(routine => (
            <RoutineCard
              key={routine.id}
              routine={routine}
              subjectName={subjectsMap.get(routine.subjectId)?.name ?? 'Unknown'}
              existingLog={getRoutineLogForToday(routine.id)}
              targetMins={routine.dayMinutes[dow] ?? 0}
              isLoggingCustom={logCustomFor === routine.id}
              customMinutes={customMinutes}
              onCustomMinutesChange={setCustomMinutes}
              onStartCustom={() => { setLogCustomFor(routine.id); setCustomMinutes('') }}
              onCancelCustom={() => { setLogCustomFor(null); setCustomMinutes('') }}
              onSaveCustom={() => { void logCustom(routine, Number(customMinutes)); setLogCustomFor(null); setCustomMinutes('') }}
              onMarkDone={() => markDone(routine)}
              onSkip={() => skipRoutine(routine)}
            />
          ))}
        </div>
      )}

      {tab === 'plan' && (
        <WeeklyPlanGrid
          routines={routines}
          activities={activities}
          onEditRoutine={r => setRoutineEditing(r)}
          onEditCell={(routineId, d, mins) => setCellEditing({ routineId, dow: d, minutes: String(mins) })}
        />
      )}

      {routineEditing && (
        <RoutineEditModal
          routine={routineEditing}
          subjects={subjects}
          onClose={() => setRoutineEditing(null)}
          onSave={async r => { await saveRoutine(r); setRoutineEditing(null) }}
          onDelete={async r => { await deleteRoutine(r); setRoutineEditing(null) }}
        />
      )}

      {cellEditing && (() => {
        const routine = routines.find(r => r.id === cellEditing.routineId)
        if (!routine) return null
        const next: Routine = {
          ...routine,
          dayMinutes: { ...routine.dayMinutes, [cellEditing.dow]: Number(cellEditing.minutes) || 0 },
          updatedAt: isoNow(),
        }
        return (
          <CellEditModal
            dayLabel={DAY_LABELS[cellEditing.dow]}
            currentMinutes={routine.dayMinutes[cellEditing.dow] ?? 0}
            value={cellEditing.minutes}
            onChange={v => setCellEditing({ ...cellEditing, minutes: v })}
            onCancel={() => setCellEditing(null)}
            onSave={async () => { await saveRoutine(next); setCellEditing(null) }}
            onClear={async () => {
              const cleared: Routine = {
                ...routine,
                dayMinutes: { ...routine.dayMinutes, [cellEditing.dow]: 0 },
                updatedAt: isoNow(),
              }
              await saveRoutine(cleared)
              setCellEditing(null)
            }}
          />
        )
      })()}

      {addRoutineOpen && (
        <RoutineEditModal
          routine={null}
          subjects={subjects}
          onClose={() => setAddRoutineOpen(false)}
          onSave={async r => { await saveRoutine(r); setAddRoutineOpen(false) }}
          onDelete={null}
        />
      )}

      {addActivityOpen && (
        <ActivityEditModal
          activity={null}
          subjects={subjects}
          onClose={() => setAddActivityOpen(false)}
          onSave={async a => { await saveActivity(a); setAddActivityOpen(false) }}
        />
      )}
    </div>
  )
}

// =============================================================================
// Routine card (Today tab)
// =============================================================================
function RoutineCard(props: {
  routine: Routine
  subjectName: string
  existingLog?: RoutineLog
  targetMins: number
  isLoggingCustom: boolean
  customMinutes: string
  onCustomMinutesChange: (v: string) => void
  onStartCustom: () => void
  onCancelCustom: () => void
  onSaveCustom: () => void
  onMarkDone: () => void
  onSkip: () => void
}) {
  const { routine, subjectName, existingLog, targetMins, isLoggingCustom, customMinutes, onCustomMinutesChange, onStartCustom, onCancelCustom, onSaveCustom, onMarkDone, onSkip } = props
  const loggedMins = existingLog?.actualMinutes ?? 0
  const pct = targetMins > 0 ? Math.min(100, Math.round((loggedMins / targetMins) * 100)) : 0

  if (existingLog?.completed) {
    return (
      <Card>
        <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
          <span className="text-green-600">✓</span>
          <span className="font-medium">{routine.name}</span>
          <span className="text-slate-400">·</span>
          <span>{loggedMins}m</span>
          <span className="text-slate-400">·</span>
          <span>Done at {format(new Date(), 'h:mm a')}</span>
        </div>
      </Card>
    )
  }

  if (existingLog && !existingLog.completed) {
    return (
      <Card>
        <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
          <span>—</span>
          <span className="font-medium">{routine.name}</span>
          <span className="text-slate-400">·</span>
          <span>Skipped</span>
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: routine.color }} />
            <CardTitle>{routine.name}</CardTitle>
          </div>
          <span className="text-sm text-slate-500 dark:text-slate-400">{targetMins}m target</span>
        </div>
      </CardHeader>
      <div className="text-sm text-slate-600 dark:text-slate-400 mb-2">
        {subjectName} · {Object.entries(routine.dayMinutes).filter(([, m]) => (m ?? 0) > 0).map(([d]) => WEEKDAYS[Number(d)]).join(' ')}
      </div>
      {loggedMins > 0 && (
        <div className="mb-3">
          <div className="h-2 rounded bg-slate-200 dark:bg-slate-700 overflow-hidden">
            <div className="h-full" style={{ width: `${pct}%`, backgroundColor: routine.color }} />
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{loggedMins}m / {targetMins}m logged</div>
        </div>
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={onMarkDone}>✓ Mark Done</Button>
        {isLoggingCustom ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              type="number"
              min="1"
              value={customMinutes}
              onChange={e => onCustomMinutesChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onSaveCustom(); if (e.key === 'Escape') onCancelCustom() }}
              className="w-20 px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800"
              placeholder="mins"
            />
            <Button size="sm" onClick={onSaveCustom}>Save</Button>
            <Button size="sm" variant="secondary" onClick={onCancelCustom}>Cancel</Button>
          </div>
        ) : (
          <Button size="sm" variant="secondary" onClick={onStartCustom}>Log Custom</Button>
        )}
        <Button size="sm" variant="danger" onClick={onSkip}>Skip</Button>
      </div>
    </Card>
  )
}

// =============================================================================
// Activity card (Today tab)
// =============================================================================
function ActivityCard(props: {
  activity: Activity
  subjectName: string | null
  existingLog?: ActivityLog
  onAttended: () => void
  onSkip: () => void
}) {
  const { activity, subjectName, existingLog, onAttended, onSkip } = props
  const mins = Object.values(activity.dayMinutes).reduce((sum, m) => sum + (m ?? 0), 0) || 60

  if (existingLog) {
    if (existingLog.status === 'completed') {
      return (
        <Card>
          <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
            <span className="text-green-600">✓</span>
            <span className="font-medium">{activity.name}</span>
            <span className="text-slate-400">·</span>
            <span>{mins}m</span>
            <span className="text-slate-400">·</span>
            <span>Done at {format(new Date(), 'h:mm a')}</span>
          </div>
        </Card>
      )
    }
    if (existingLog.status === 'skipped') {
      return (
        <Card>
          <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
            <span>—</span>
            <span className="font-medium">{activity.name}</span>
            <span className="text-slate-400">·</span>
            <span>Skipped</span>
          </div>
        </Card>
      )
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: activity.color }} />
            <CardTitle>{activity.name}</CardTitle>
          </div>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {mins}m{activity.scheduledTime ? ` · ${formatTime12h(activity.scheduledTime)}` : ''}
          </span>
        </div>
      </CardHeader>
      {activity.scheduledTime && (
        <div className="text-sm text-slate-600 dark:text-slate-400 mb-3">{timeUntil(activity.scheduledTime)}</div>
      )}
      {subjectName && (
        <div className="text-sm text-slate-600 dark:text-slate-400 mb-2">{subjectName}</div>
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={onAttended}>✓ Attended</Button>
        <Button size="sm" variant="danger" onClick={onSkip}>Skipped</Button>
      </div>
    </Card>
  )
}

// =============================================================================
// Weekly Plan grid
// =============================================================================
function WeeklyPlanGrid(props: {
  routines: Routine[]
  activities: Activity[]
  onEditRoutine: (r: Routine) => void
  onEditCell: (routineId: string, dow: DayOfWeek, minutes: number) => void
}) {
  const { routines, activities, onEditRoutine, onEditCell } = props

  if (routines.length === 0 && activities.length === 0) {
    return <EmptyState title="No routines or activities yet" description="Add one using the buttons above to start planning your week." />
  }


  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[640px]" style={{ gridTemplateColumns: '200px repeat(7, minmax(70px, 1fr))' }}>
        <div />
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-xs font-semibold text-slate-600 dark:text-slate-300 py-2 border-b border-slate-200 dark:border-slate-700">
            {d}
          </div>
        ))}
        {routines.map(r => (
          <RoutineGridRow key={r.id} routine={r} onEditRoutine={onEditRoutine} onEditCell={onEditCell} />
        ))}
        {activities.map(a => (
          <ActivityGridRow key={a.id} activity={a} onEditCell={onEditCell} />
        ))}
      </div>
    </div>
)}

function RoutineGridRow(props: { routine: Routine; onEditRoutine: (r: Routine) => void; onEditCell: (id: string, dow: DayOfWeek, m: number) => void }) {
  const { routine, onEditRoutine, onEditCell } = props
  return (
    <>
      <button
        onClick={() => onEditRoutine(routine)}
        className="text-left py-2 pr-3 text-sm font-medium text-slate-700 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
      >
        <div className="flex items-center gap-2 truncate">
          <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: routine.color }} />
          <span className="truncate">{routine.name}</span>
        </div>
      </button>
      {WEEKDAYS.map((_, i) => {
        const dow = i as DayOfWeek
        const mins = routine.dayMinutes[dow] ?? 0
        return (
          <div key={i} className="border-b border-slate-100 dark:border-slate-800 p-1">
            {mins > 0 ? (
              <button
                onClick={() => onEditCell(routine.id, dow, mins)}
                className="w-full rounded text-xs text-white font-medium flex items-center justify-center transition-opacity hover:opacity-80"
                style={{ backgroundColor: routine.color, height: '40px' }}
                title={`${mins}m on ${DAY_LABELS[dow]}`}
              >
                {mins}m
              </button>
            ) : (
              <div className="h-[40px]" />
            )}
          </div>
        )
      })}
    </>
  )
}

function ActivityGridRow(props: { activity: Activity; onEditCell: (id: string, dow: DayOfWeek, m: number) => void }) {
  const { activity, onEditCell } = props
  return (
    <>
      <div className="text-left py-2 pr-3 text-sm text-slate-600 dark:text-slate-300 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2 truncate">
          <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: activity.color }} />
          <span className="truncate">{activity.name}{activity.scheduledTime ? ` (${formatTime12h(activity.scheduledTime)})` : ''}</span>
        </div>
      </div>
      {WEEKDAYS.map((_, i) => {
        const dow = i as DayOfWeek
        const mins = activity.dayMinutes[dow] ?? 0
        const displayTime = dow === todayDow() && activity.scheduledTime
        return (
          <div key={i} className="border-b border-slate-100 dark:border-slate-800 p-1">
            {mins > 0 ? (
              <button
                onClick={() => onEditCell(activity.id, dow, mins)}
                className="w-full rounded text-xs text-white font-medium flex items-center justify-center transition-opacity hover:opacity-80"
                style={{ backgroundColor: activity.color, height: '40px' }}
                title={`${mins}m on ${DAY_LABELS[dow]}`}
              >
                {displayTime ? formatTime12h(activity.scheduledTime!) : `${mins}m`}
              </button>
            ) : (
              <div className="h-[40px]" />
            )}
          </div>
        )
      })}
    </>
  )
}

// =============================================================================
// Modals
// =============================================================================
function CellEditModal(props: {
  dayLabel: string
  currentMinutes: number
  value: string
  onChange: (v: string) => void
  onSave: () => void
  onCancel: () => void
  onClear: () => void
}) {
  const { dayLabel, value, currentMinutes, onChange, onSave, onCancel, onClear } = props
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div className="bg-white dark:bg-slate-800 rounded-lg p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-1 text-slate-800 dark:text-slate-100">Edit minutes</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Currently {currentMinutes}m on {dayLabel}</p>
        <input
          autoFocus
          type="number"
          min="0"
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel() }}
          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 mb-4"
        />
        <div className="flex justify-between gap-2">
          <Button size="sm" variant="danger" onClick={onClear}>Clear</Button>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={onCancel}>Cancel</Button>
            <Button size="sm" onClick={onSave}>Save</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function RoutineEditModal(props: {
  routine: Routine | null
  subjects: Array<{ id: string; name: string }>
  onClose: () => void
  onSave: (r: Routine) => Promise<void>
  onDelete: ((r: Routine) => Promise<void>) | null
}) {
  const { routine, subjects, onClose, onSave, onDelete } = props
  const [name, setName] = useState(routine?.name ?? '')
  const [subjectId, setSubjectId] = useState(routine?.subjectId ?? subjects[0]?.id ?? '')
  const [color, setColor] = useState(routine?.color ?? DEFAULT_COLORS[0])
  const [dayMinutes, setDayMinutes] = useState<Partial<Record<DayOfWeek, number>>>(routine?.dayMinutes ?? {})
  const [scheduledTime, setScheduledTime] = useState(routine?.scheduledTime ?? '')
  const [notes, setNotes] = useState(routine?.notes ?? '')

  function setDay(dow: DayOfWeek, mins: number) {
    const next = { ...dayMinutes }
    if (mins <= 0) delete next[dow]
    else next[dow] = mins
    setDayMinutes(next)
  }

  async function handleSave() {
    const now = isoNow()
    const next: Routine = {
      id: routine?.id ?? uuid(),
      name: name.trim() || 'Untitled Routine',
      subjectId,
      dayMinutes,
      color,
      scheduledTime: scheduledTime || undefined,
      notes: notes || undefined,
      createdAt: routine?.createdAt ?? now,
      updatedAt: now,
    }
    await onSave(next)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4 text-slate-800 dark:text-slate-100">{routine ? 'Edit Routine' : 'New Routine'}</h3>
        <div className="space-y-3">
          <Field label="Name">
            <input type="text" value={name} onChange={e => setName(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Subject">
            <select value={subjectId} onChange={e => setSubjectId(e.target.value)} className={inputCls}>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Color">
            <div className="flex gap-2 flex-wrap">
              {DEFAULT_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn('w-7 h-7 rounded-full border-2', color === c ? 'border-slate-900 dark:border-white' : 'border-transparent')}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </Field>
          <Field label="Days & minutes">
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map((d, i) => {
                const dow = i as DayOfWeek
                const active = (dayMinutes[dow] ?? 0) > 0
                return (
                  <div key={d} className="text-center">
                    <button
                      type="button"
                      onClick={() => setDay(dow, active ? 0 : 30)}
                      className={cn('w-full text-xs font-medium py-1 rounded', active ? 'bg-primary-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300')}
                    >{d}</button>
                    {active && (
                      <input
                        type="number"
                        min="5"
                        step="5"
                        value={dayMinutes[dow] ?? 30}
                        onChange={e => setDay(dow, Number(e.target.value))}
                        className="w-full mt-1 px-1 py-0.5 text-xs border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900"
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </Field>
          <Field label="Scheduled time (optional)">
            <input type="time" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Notes">
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={inputCls} />
          </Field>
        </div>
        <div className="flex justify-between mt-6">
          <div>
            {onDelete && routine && (
              <Button size="sm" variant="danger" onClick={() => onDelete(routine)}>Delete</Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={handleSave}>Save</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ActivityEditModal(props: {
  activity: Activity | null
  subjects: Array<{ id: string; name: string }>
  onClose: () => void
  onSave: (a: Activity) => Promise<void>
}) {
  const { activity, subjects, onClose, onSave } = props
  const [name, setName] = useState(activity?.name ?? '')
  const [subjectId, setSubjectId] = useState<string>(activity?.subjectId ?? '')
  const [color, setColor] = useState(activity?.color ?? DEFAULT_COLORS[1])
  const [dayMinutes, setDayMinutes] = useState<Partial<Record<DayOfWeek, number>>>(activity?.dayMinutes ?? {})
  const [scheduledTime, setScheduledTime] = useState(activity?.scheduledTime ?? '')
  const [notes, setNotes] = useState(activity?.notes ?? '')
  const [minutes, setMinutes] = useState(activity ? Math.max(...Object.values(activity.dayMinutes).map(m => m ?? 0), 60) : 60)

  function setDay(dow: DayOfWeek, active: boolean) {
    const next = { ...dayMinutes }
    if (active) next[dow] = minutes
    else delete next[dow]
    setDayMinutes(next)
  }

  function updateMinutes(m: number) {
    setMinutes(m)
    const next: Partial<Record<DayOfWeek, number>> = {}
    for (const d of Object.keys(dayMinutes) as unknown as DayOfWeek[]) next[d] = m
    setDayMinutes(next)
  }

  async function handleSave() {
    const now = isoNow()
    const next: Activity = {
      id: activity?.id ?? uuid(),
      name: name.trim() || 'Untitled Activity',
      subjectId: subjectId || null,
      dayMinutes,
      scheduledTime: scheduledTime || undefined,
      notes: notes || undefined,
      color,
      createdAt: activity?.createdAt ?? now,
      updatedAt: now,
    }
    await onSave(next)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4 text-slate-800 dark:text-slate-100">{activity ? 'Edit Activity' : 'New Activity'}</h3>
        <div className="space-y-3">
          <Field label="Name">
            <input type="text" value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder="e.g. Japanese Tutoring" />
          </Field>
          <Field label="Subject (optional)">
            <select value={subjectId} onChange={e => setSubjectId(e.target.value)} className={inputCls}>
              <option value="">None</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Color">
            <div className="flex gap-2 flex-wrap">
              {DEFAULT_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn('w-7 h-7 rounded-full border-2', color === c ? 'border-slate-900 dark:border-white' : 'border-transparent')}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </Field>
          <Field label="Minutes per session">
            <input type="number" min="5" step="5" value={minutes} onChange={e => updateMinutes(Number(e.target.value))} className={inputCls} />
          </Field>
          <Field label="Days">
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map((d, i) => {
                const dow = i as DayOfWeek
                const active = (dayMinutes[dow] ?? 0) > 0
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDay(dow, !active)}
                    className={cn('text-xs font-medium py-1 rounded', active ? 'bg-primary-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300')}
                  >{d}</button>
                )
              })}
            </div>
          </Field>
          <Field label="Scheduled time (optional)">
            <input type="time" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Notes">
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={inputCls} />
          </Field>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave}>Save</Button>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Shared helpers
// =============================================================================
const inputCls = 'w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100'

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">{props.label}</span>
      {props.children}
    </label>
  )
}

function formatTime12h(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hh = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${hh}:${String(m).padStart(2, '0')} ${period}`
}