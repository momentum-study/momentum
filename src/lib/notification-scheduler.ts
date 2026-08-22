/**
 * Notification scheduler for time-based reminders (habits, due dates).
 * Runs a lightweight check every 30s, fire-once-per-day dedupe via
 * `lastNotifiedDate` keys persisted in localStorage.
 */
import { db } from '../db/app-db'
import { sendNotification } from './notification-service'
import { format, parseISO, addDays, subDays } from 'date-fns'


const SCHEDULER_KEY = 'momentum-notif-scheduler-state'
const POLL_MS = 30_000

interface SchedulerState {
  habitReminders: Record<string, string>  // habitId -> "YYYY-MM-DD" already notified
  dueDateReminders: Record<string, string>  // assignmentId -> "YYYY-MM-DD"
  reviewReminders: Record<string, string>  // reviewId -> "YYYY-MM-DD"
  lastCheckedMinute: string  // "YYYY-MM-DDTHH:MM" throttle key
}

const emptyState: SchedulerState = {
  habitReminders: {},
  dueDateReminders: {},
  reviewReminders: {},
  lastCheckedMinute: '',
}

function loadState(): SchedulerState {
  if (typeof localStorage === 'undefined') return emptyState
  try {
    const raw = localStorage.getItem(SCHEDULER_KEY)
    if (!raw) return emptyState
    const parsed = JSON.parse(raw) as Partial<SchedulerState>
    return {
      habitReminders: parsed.habitReminders ?? {},
      dueDateReminders: parsed.dueDateReminders ?? {},
      reviewReminders: parsed.reviewReminders ?? {},
      lastCheckedMinute: parsed.lastCheckedMinute ?? '',
    }
  } catch {
    return emptyState
  }
}

function saveState(state: SchedulerState): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(SCHEDULER_KEY, JSON.stringify(state))
  } catch {
    // ignore quota errors
  }
}

function currentTime(now: Date = new Date()): string {
  return format(now, 'HH:mm')
}

function currentDate(now: Date = new Date()): string {
  return format(now, 'yyyy-MM-dd')
}

/** Convert "HH:MM" to minutes since midnight. */
function toMinutes(time: string): number {
  const parts = time.split(':')
  const h = Number(parts[0] ?? 0)
  const m = Number(parts[1] ?? 0)
  return h * 60 + m
}

/** Check all habit reminders and fire any that match the current minute window. */
async function checkHabitReminders(state: SchedulerState, now: Date): Promise<SchedulerState> {
  const today = currentDate(now)
  const nowMin = toMinutes(currentTime(now))
  const habits = await db.habits.toArray()
  const habitLogs = await db.habitLogs.toArray()

  for (const habit of habits) {
    if (!habit.reminderTime) continue
    if (habit.archivedAt || habit.finishedAt || habit.deletedAt) continue
    if (habit.status === 'potential') continue

    const targetMin = toMinutes(habit.reminderTime)
    // Fire when the current minute matches the reminder time (within the
    // 30s poll window). We compare on whole minutes.
    if (Math.abs(nowMin - targetMin) > 0) continue

    // Dedupe — only fire once per habit per day
    const lastSent = state.habitReminders[habit.id]
    if (lastSent === today) continue

    // Only remind if today is not yet logged
    const alreadyLogged = habitLogs.some(
      (log) => log.habitId === habit.id && log.date === today && !log.deletedAt
    )
    if (alreadyLogged) {
      // Mark as sent so we don't keep checking this habit today
      state.habitReminders[habit.id] = today
      continue
    }

    sendNotification(
      'Habit reminder',
      `Have you logged "${habit.name}" today?`,
      `habit-reminder-${habit.id}`
    )
    state.habitReminders[habit.id] = today
  }
  return state
}

/** Check due-date assignments and fire reminders: 1 day before + day-of. */
async function checkDueDateReminders(state: SchedulerState, now: Date): Promise<SchedulerState> {
  const today = currentDate(now)
  const tomorrow = format(addDays(now, 1), 'yyyy-MM-dd')
  const yesterday = format(subDays(now, 1), 'yyyy-MM-dd')
  const assignments = await db.assignments.toArray()

  for (const a of assignments) {
    if (a.deletedAt || a.completed) continue
    if (!a.dueDate) continue

    const lastSent = state.dueDateReminders[a.id]
    if (lastSent === today) continue

    if (a.dueDate === tomorrow) {
      sendNotification('Due tomorrow', `"${a.title}" is due tomorrow.`, `due-tomorrow-${a.id}`)
      state.dueDateReminders[a.id] = today
    } else if (a.dueDate === today) {
      sendNotification('Due today', `"${a.title}" is due today.`, `due-today-${a.id}`)
      state.dueDateReminders[a.id] = today
    } else if (a.dueDate === yesterday) {
      // Day-after: gentle overdue notice (only the first day overdue)
      sendNotification('Overdue', `"${a.title}" was due yesterday.`, `overdue-${a.id}`)
      state.dueDateReminders[a.id] = today
    }
  }
  return state
}

/** Check FSRS study reviews due today and remind user to review. */
async function checkReviewReminders(state: SchedulerState, now: Date): Promise<SchedulerState> {
  const today = currentDate(now)
  const areas = await db.studyAreas.toArray()
  const reviews = await db.studyReviews.toArray()
  for (const area of areas) {
    if (area.deletedAt) continue
    if (!area.fsrs?.nextReview) continue
    if (area.fsrs.nextReview > today) continue
    const lastSent = state.reviewReminders[area.id]
    if (lastSent === today) continue
    // Skip if a review exists today
    const reviewedToday = reviews.some(
      (r) => r.areaId === area.id && format(parseISO(r.reviewedAt), 'yyyy-MM-dd') === today
    )
    if (reviewedToday) {
      state.reviewReminders[area.id] = today
      continue
    }
    sendNotification('Review due', `"${area.name}" is due for review.`, `review-due-${area.id}`)
    state.reviewReminders[area.id] = today
  }
  return state
}

/** Run a single tick — called by the polling loop. Idempotent within a minute. */
export async function runNotificationTick(now: Date = new Date()): Promise<void> {
  const minute = format(now, 'yyyy-MM-dd HH:mm')
  const state = loadState()
  if (state.lastCheckedMinute === minute) return
  state.lastCheckedMinute = minute

  await checkHabitReminders(state, now)
  await checkDueDateReminders(state, now)
  await checkReviewReminders(state, now)

  // Prune entries older than 7 days to keep localStorage small
  const weekAgo = format(subDays(now, 7), 'yyyy-MM-dd')
  for (const key of Object.keys(state.habitReminders)) {
    if ((state.habitReminders[key] ?? '') < weekAgo) delete state.habitReminders[key]
  }
  for (const key of Object.keys(state.dueDateReminders)) {
    if ((state.dueDateReminders[key] ?? '') < weekAgo) delete state.dueDateReminders[key]
  }
  for (const key of Object.keys(state.reviewReminders)) {
    if ((state.reviewReminders[key] ?? '') < weekAgo) delete state.reviewReminders[key]
  }

  saveState(state)
}

let intervalId: number | null = null

/** Start the global notification polling loop. Safe to call once on app mount. */
export function startNotificationScheduler(): () => void {
  if (typeof window === 'undefined') return () => {}
  if (intervalId !== null) return () => {}
  // First tick: run on next idle so the UI can mount first
  const initial = window.setTimeout(() => { void runNotificationTick() }, 2_000)
  intervalId = window.setInterval(() => { void runNotificationTick() }, POLL_MS)
  return () => {
    window.clearTimeout(initial)
    if (intervalId !== null) {
      window.clearInterval(intervalId)
      intervalId = null
    }
  }
}
