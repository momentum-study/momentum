import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { loadTimerState } from '../../lib/timer-persistence'
import { isTimerActive, getLiveTimerSubjectId } from '../../lib/timer-utils'
import { useSubjects } from '../../app/providers'

function formatSeconds(totalSeconds: number): string {
  const mm = Math.floor(totalSeconds / 60)
  const ss = totalSeconds % 60
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

/** Elapsed seconds for the main timer only (momentum-timer-state), excluding QuickTimer. */
function getMainTimerSeconds(): number {
  const state = loadTimerState()
  if (!state) return 0
  if (state.mode === 'simple') {
    if (state.startedAt !== null) {
      return state.simplePausedOffset + Math.floor((Date.now() - state.startedAt) / 1000)
    }
    return state.simplePausedOffset
  }
  // Pomodoro: elapsed time during the current phase
  if (state.startedAt !== null) {
    return Math.floor((Date.now() - state.startedAt) / 1000)
  }
  return 0
}

export function FloatingTimerBanner() {
  const location = useLocation()
  const navigate = useNavigate()
  const subjects = useSubjects()
  const [seconds, setSeconds] = useState(0)
  const [subjectId, setSubjectId] = useState<string | null>(null)

  const isDashboard = location.pathname === '/'

  useEffect(() => {
    if (isDashboard) return

    function tick() {
      if (!isTimerActive()) {
        setSeconds(0)
        setSubjectId(null)
        return
      }
      setSeconds(getMainTimerSeconds())
      setSubjectId(getLiveTimerSubjectId())
    }

    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [isDashboard])

  if (isDashboard || seconds <= 0) return null

  const subjectName = subjectId
    ? subjects.find((s) => s.id === subjectId)?.name ?? null
    : null

  return (
    <div
      className="pointer-events-auto fixed bottom-4 left-1/2 z-50 -translate-x-1/2"
      aria-live="polite"
      aria-label="Active study timer"
    >
      <button onClick={() => navigate('/')} className="flex items-center gap-2 rounded-full bg-primary-600 px-5 py-2 shadow-lg">
        <span className="text-sm font-medium text-white">
          Studying{subjectName ? `: ${subjectName}` : ''}
        </span>
        <span className="text-sm font-bold text-white tabular-nums">
          {formatSeconds(seconds)}
        </span>
      </button>
    </div>
  )
}
