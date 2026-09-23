/**
 * Hook that tracks the current calendar date and forces a re-render every 60
 * seconds so that components using today's date (heatmap, streak, checklist,
 * etc.) automatically update at midnight without requiring a page reload.
 *
 * Returns `{ todayStr, todayDow }` where:
 *  - `todayStr` is `yyyy-MM-dd` in local timezone
 *  - `todayDow` is the day-of-week as 0–6 (Sun–Sat)
 */
import { useState, useEffect } from 'react'
import { format } from 'date-fns'

export function useDay() {
  const [state, setState] = useState(() => {
    const now = new Date()
    return {
      todayStr: format(now, 'yyyy-MM-dd'),
      todayDow: now.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    }
  })

  useEffect(() => {
    const id = window.setInterval(() => {
      const now = new Date()
      setState({
        todayStr: format(now, 'yyyy-MM-dd'),
        todayDow: now.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6,
      })
    }, 60_000)
    return () => clearInterval(id)
  }, [])

  return state
}
