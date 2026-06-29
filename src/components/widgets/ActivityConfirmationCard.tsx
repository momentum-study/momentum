import { useState, useEffect, useMemo } from 'react'
import { format } from 'date-fns'
import { useData } from '../../app/providers'
import { db } from '../../db/app-db'
import { isoNow } from '../../lib/utils'
import { Button } from '../../components/ui/Button'
import { v4 as uuid } from 'uuid'
import type { Activity, ActivityLog, DayOfWeek, Session } from '../../domain/types'
import { updateRoutineLogsForSession, updateStreakDayForSession } from '../../lib/routine-tracker'

interface ActivityConfirmationCardProps {
  onDismiss: () => void
}

export function ActivityConfirmationCard({ onDismiss }: ActivityConfirmationCardProps) {
  const { data, loadData } = useData()
  const todayDow = new Date().getDay() as DayOfWeek
  const todayStr = format(new Date(), 'yyyy-MM-dd')

  // Build the list of activities due today that are not yet handled.
  const pendingActivities = useMemo<Activity[]>(() => {
    const { activities, activityLogs, sessions } = data

    // Collect activityIds that already have a completed/skipped log today.
    const handledLogMap = new Map<string, boolean>()
    for (const log of activityLogs) {
      if (log.date === todayStr && (log.status === 'completed' || log.status === 'skipped')) {
        handledLogMap.set(log.activityId, true)
      }
    }

    // Collect subjectIds that have a session today (auto-complete case).
    const sessionSubjectIds = new Set<string>()
    for (const s of sessions) {
      if (!s.deletedAt && format(new Date(s.startAt), 'yyyy-MM-dd') === todayStr) {
        sessionSubjectIds.add(s.subjectId)
      }
    }

    // Find activities scheduled today, not yet handled, whose scheduledTime has passed (or is absent).
    const now = new Date()
    const currentTimeStr = format(now, 'HH:mm')

    return activities.filter((a) => {
      if (handledLogMap.has(a.id)) return false
      const mins = a.dayMinutes[todayDow]
      if (!mins || mins <= 0) return false
      // Auto-complete: if a matching session exists, skip showing this card.
      if (a.subjectId && sessionSubjectIds.has(a.subjectId)) return false
      // scheduledTime is optional; if set, only show once it has passed.
      if (a.scheduledTime && a.scheduledTime > currentTimeStr) return false
      return true
    })
  }, [data, todayDow, todayStr])

  const [index, setIndex] = useState(0)

  // Reset index if pending list shrinks (e.g., after a concurrent write).
  useEffect(() => {
    if (index >= pendingActivities.length) setIndex(0)
  }, [pendingActivities.length, index])

  // Auto-dismiss if nothing is due.
  useEffect(() => {
    if (pendingActivities.length === 0) onDismiss()
  }, [pendingActivities.length, onDismiss])

  if (pendingActivities.length === 0) return null

  const activity = pendingActivities[index]
  const pendingCount = pendingActivities.length
  const dayMinutes = activity.dayMinutes[todayDow] ?? 0

  const handleYes = async () => {
    const now = isoNow()
    const sessionId = uuid()

    if (activity.subjectId) {
      // Create a session for this subject with the scheduled duration.
      const session: Session = {
        id: sessionId,
        subjectId: activity.subjectId,
        startAt: now,
        endAt: now,
        durationMinutes: dayMinutes,
        source: 'manual',
        createdAt: now,
        updatedAt: now,
      }
      await db.sessions.add(session)
      await updateRoutineLogsForSession(session)
      await updateStreakDayForSession(session)
    }

    // Log as completed.
    const logEntry: ActivityLog = {
      id: uuid(),
      activityId: activity.id,
      date: todayStr,
      status: 'completed',
      actualMinutes: dayMinutes,
      createdAt: now,
    }
    await db.activityLogs.add(logEntry)
    await loadData()
    onDismiss()
  }

  const handleNo = async () => {
    const now = isoNow()
    const logEntry: ActivityLog = {
      id: uuid(),
      activityId: activity.id,
      date: todayStr,
      status: 'skipped',
      createdAt: now,
    }
    await db.activityLogs.add(logEntry)
    await loadData()
    onDismiss()
  }

  const handleLater = async () => {
    const now = isoNow()
    const logEntry: ActivityLog = {
      id: uuid(),
      activityId: activity.id,
      date: todayStr,
      status: 'pending',
      createdAt: now,
    }
    await db.activityLogs.add(logEntry)
    await loadData()
    onDismiss()

    // Re-check in 15 minutes — the parent re-renders the card via loadData.
    setTimeout(() => {
      loadData()
    }, 15 * 60 * 1000)
  }

  return (
    <div className="rounded-lg border border-primary-200 bg-primary-50 p-4 dark:border-primary-800 dark:bg-primary-900/20">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-primary-800 dark:text-primary-200">
            {activity.name} — {dayMinutes} min scheduled
          </p>
          {pendingCount > 1 && (
            <p className="mt-0.5 text-xs text-primary-600 dark:text-primary-400">
              {pendingCount - 1} more pending
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="primary" size="sm" onClick={handleYes}>Yes, logged</Button>
          <Button variant="secondary" size="sm" onClick={handleNo}>No, skip</Button>
          <Button variant="secondary" size="sm" onClick={handleLater}>Remind later</Button>
        </div>
      </div>
    </div>
  )
}
