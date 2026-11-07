// Shared, ephemeral streak preview state. The PomodoroTimer can flip a
// "today counts toward the streak" flag on when the user starts a session
// and off when they discard it, so the streak widget shows the correct
// count in real time without waiting for the session to be persisted.
import { useSyncExternalStore } from 'react'
import { toLocalDateString } from './utils'
// Logical study day (§10.73): the preview date must match the day bucket
// sessions land in (toLocalDateString), not the raw calendar date.
const today = () => toLocalDateString(new Date().toISOString())
// Set of dates currently being counted toward the streak as a preview.
// Usually empty; the timer toggles [{today}] when running and clears it
// on stop (real session takes over) or discard (revert).
type Listener = () => void
const listeners = new Set<Listener>()
let previewDates: Set<string> = new Set()

function emit() {
  for (const l of listeners) l()
}

export function setStreakPreviewDates(dates: Set<string>) {
  if (dates.size === previewDates.size && [...dates].every((d) => previewDates.has(d))) return
  previewDates = new Set(dates)
  emit()
}

export function addStreakPreviewDate(date: string) {
  if (previewDates.has(date)) return
  previewDates = new Set(previewDates)
  previewDates.add(date)
  emit()
}

export function removeStreakPreviewDate(date: string) {
  if (!previewDates.has(date)) return
  previewDates = new Set(previewDates)
  previewDates.delete(date)
  emit()
}

export function clearStreakPreviewDates() {
  if (previewDates.size === 0) return
  previewDates = new Set()
  emit()
}

export function getStreakPreviewDates(): Set<string> {
  return previewDates
}

export function useStreakPreviewDates(): Set<string> {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l) } },
    () => previewDates,
    () => previewDates,
  )
}

/** Convenience: toggle today's preview on/off. */
export function setTodayPreview(on: boolean) {
  const t = today()
  if (on) addStreakPreviewDate(t)
  else removeStreakPreviewDate(t)
}
