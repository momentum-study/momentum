import { useState, useEffect } from 'react'

export const DASHBOARD_WIDGETS: { id: string; label: string }[] = [
  { id: 'stats',        label: 'Today & This Week' },
  { id: 'today',        label: 'Today Overview' },
  { id: 'streak-goal',  label: 'Study Streak & Daily Goal' },
  { id: 'pomodoro',     label: 'Study Timer' },
  { id: 'quick-timer',  label: 'Quick Timer' },
  { id: 'log-time',     label: 'Log Study Time' },
  { id: 'study-review', label: 'Study Review' },
  { id: 'calendar',     label: 'Study Calendar' },
  { id: 'recent',       label: 'Recent Sessions' },
]

const DEFAULT_WIDGETS = DASHBOARD_WIDGETS.map((w) => w.id)

export function useDashboardWidgets() {
  const [visibleWidgets, setVisibleWidgets] = useState<string[]>(() => {
    if (typeof localStorage === 'undefined') return DEFAULT_WIDGETS
    try {
      const saved = localStorage.getItem('momentum-dashboard-widgets')
      if (!saved) return DEFAULT_WIDGETS
      const parsed = JSON.parse(saved) as string[]
      return Array.isArray(parsed) ? parsed : DEFAULT_WIDGETS
    } catch {
      return DEFAULT_WIDGETS
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('momentum-dashboard-widgets', JSON.stringify(visibleWidgets))
    } catch { /* ignore */ }
  }, [visibleWidgets])

  return { visibleWidgets, setVisibleWidgets }
}

export function loadDashboardWidgets(): string[] {
  return DEFAULT_WIDGETS
}

export function saveDashboardWidgets(order: string[]) {
  try {
    localStorage.setItem('momentum-dashboard-widgets', JSON.stringify(order))
  } catch { /* ignore */ }
}
