import { useEffect, useRef, useState } from 'react'
import { v4 as uuid } from 'uuid'
import { useData } from '../../app/providers'
import { db } from '../../db/app-db'
import { Button } from '../ui/Button'
import { Card, CardHeader, CardTitle } from '../ui/Card'
import { cn, isoNow } from '../../lib/utils'
import { loadSettings, saveSettings } from '../../features/settings/SettingsPage'
import type { Settings } from '../../features/settings/SettingsPage'
import { useSessionSync } from '../../lib/use-session-sync'
import { updateRoutineLogsForSession } from '../../lib/routine-tracker'
import { clearTimerState, loadTimerState, saveTimerState } from '../../lib/timer-persistence'
import type { PersistedTimerState } from '../../lib/timer-persistence'

type Mode = 'pomodoro' | 'simple'
type Phase = 'focus' | 'shortBreak' | 'longBreak'

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function playNotificationSound() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 800
    gain.gain.value = 0.3
    osc.start()
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
    osc.stop(ctx.currentTime + 0.5)
  } catch {
    // Audio not available
  }
}

function getPhaseDuration(phase: Phase, cfg?: { focusMinutes: number; breakMinutes: number; longBreakMinutes: number }): number {
  const settings = loadSettings()
  const c = cfg ?? { focusMinutes: settings.pomodoroFocusMinutes, breakMinutes: settings.pomodoroBreakMinutes, longBreakMinutes: settings.pomodoroLongBreakMinutes }
  if (phase === 'focus') return c.focusMinutes * 60
  if (phase === 'shortBreak') return c.breakMinutes * 60
  return c.longBreakMinutes * 60
}

export function PomodoroTimer() {
  const { data, loadData } = useData()
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [showConfig, setShowConfig] = useState(false)

  // Local config state (editable from the gear panel)
  const [config, setConfig] = useState({
    focusMinutes: settings.pomodoroFocusMinutes,
    breakMinutes: settings.pomodoroBreakMinutes,
    longBreakMinutes: settings.pomodoroLongBreakMinutes,
    cycles: settings.pomodoroCyclesBeforeLongBreak,
    soundEnabled: settings.soundEnabled,
  })

  const [subjectId, setSubjectId] = useState<string>('')
  const [projectId, setProjectId] = useState<string>('')
  const [taskId, setTaskId] = useState<string>('')

  // Mode — try to restore from localStorage
  const [mode, setMode] = useState<Mode>(() => {
    const saved = loadTimerState()
    return saved?.mode ?? 'simple'
  })

  // Simple timer: store start timestamp (ms) instead of counter
  // When null, timer is stopped/paused
  const [simpleStartedAt, setSimpleStartedAt] = useState<number | null>(() => {
    const saved = loadTimerState()
    if (saved?.mode === 'simple' && saved.startedAt) return saved.startedAt
    return null
  })
  const [simpleSeconds, setSimpleSeconds] = useState(0)
  const simpleIntervalRef = useRef<number | null>(null)

  // Pomodoro timer
  const [pomPhase, setPomPhase] = useState<Phase>(() => {
    const saved = loadTimerState()
    return saved?.phase ?? 'focus'
  })
  const [pomStartedAt, setPomStartedAt] = useState<number | null>(() => {
    const saved = loadTimerState()
    if (saved?.mode === 'pomodoro' && saved.startedAt) return saved.startedAt
    return null
  })
  const [pomSeconds, setPomSeconds] = useState(() => {
    const saved = loadTimerState()
    if (saved?.mode === 'pomodoro' && saved.phaseRemaining) return saved.phaseRemaining
    return settings.pomodoroFocusMinutes * 60
  })
  const [pomCycles, setPomCycles] = useState(() => {
    const saved = loadTimerState()
    return saved?.cyclesCompleted ?? 0
  })
  const pomIntervalRef = useRef<number | null>(null)

  // Refs so the interval callback always sees latest values
  const configRef = useRef(config)
  configRef.current = config

  const stateRef = useRef({ pomPhase, subjectId, projectId, taskId, pomCycles })
  stateRef.current = { pomPhase, subjectId, projectId, taskId, pomCycles }



  useEffect(() => {
    if (!subjectId && data.subjects[0]) setSubjectId(data.subjects[0].id)
  }, [data.subjects, subjectId])

  // Simple timer tick — compute elapsed from wall clock
  useEffect(() => {
    if (!simpleStartedAt) return
    const tick = () => {
      const elapsed = Math.floor((Date.now() - simpleStartedAt) / 1000)
      setSimpleSeconds(elapsed)
    }
    tick()
    const interval = window.setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [simpleStartedAt])

  // Pomodoro timer tick — compute remaining from wall clock
  useEffect(() => {
    if (!pomStartedAt) return
    const tick = () => {
      const saved = loadTimerState()
      const currentPhase = saved?.phase ?? pomPhase
      const duration = getPhaseDuration(currentPhase, configRef.current)
      const elapsed = Math.floor((Date.now() - pomStartedAt) / 1000)
      const remaining = Math.max(0, duration - elapsed)
      setPomSeconds(remaining)
    }
    tick()
    const interval = window.setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [pomStartedAt, pomPhase])

  // Pomodoro phase transition — fires when phase timer hits 0
  useEffect(() => {
    if (!pomStartedAt) return
    if (pomSeconds > 0) return
    if (configRef.current.soundEnabled) playNotificationSound()
    const st = stateRef.current
    const cfg = configRef.current

    if (pomPhase === 'focus') {
      // Save the completed focus session
      const actualSubjId = st.projectId ? (data.projects.find((p) => p.id === st.projectId)?.subjectId ?? st.subjectId) : st.subjectId
      if (actualSubjId) {
        const task = st.taskId ? data.assignments.find((a) => a.id === st.taskId) : undefined
        const project = st.projectId ? data.projects.find((p) => p.id === st.projectId) : undefined
        const end = new Date()
        const start = new Date(end.getTime() - cfg.focusMinutes * 60 * 1000)
        const session = {
          id: uuid(),
          subjectId: actualSubjId,
          projectId: project?.id ?? null,
          assignmentId: task?.id ?? null,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          durationMinutes: cfg.focusMinutes,
          note: task ? `Task: ${task.title}` : undefined,
          source: 'pomodoro' as const,
          createdAt: isoNow(),
          updatedAt: isoNow(),
        }
        void db.sessions.add(session).then(async () => {
          const subjectName = data.subjects.find((s) => s.id === actualSubjId)?.name ?? 'Unknown Subject'
          syncSession(session, subjectName)
          await updateRoutineLogsForSession(session)
          await loadData()
        })
      }
      const newCycles = st.pomCycles + 1
      setPomCycles(newCycles)
      const nextPhase = newCycles % cfg.cycles === 0 ? 'longBreak' : 'shortBreak'
      setPomPhase(nextPhase)
      const now = Date.now()
      setPomStartedAt(now)
      const newState: PersistedTimerState = {
        mode: 'pomodoro',
        startedAt: now,
        phaseRemaining: getPhaseDuration(nextPhase, cfg),
        phase: nextPhase,
        cyclesCompleted: newCycles,
        config: cfg,
      }
      saveTimerState(newState)
    } else {
      // Break completed — go back to focus
      setPomPhase('focus')
      const now = Date.now()
      setPomStartedAt(now)
      const newState: PersistedTimerState = {
        mode: 'pomodoro',
        startedAt: now,
        phaseRemaining: cfg.focusMinutes * 60,
        phase: 'focus',
        cyclesCompleted: st.pomCycles,
        config: cfg,
      }
      saveTimerState(newState)
    }
  }, [pomStartedAt, pomSeconds, pomPhase])


  // Cleanup on unmount: clear intervals but DON'T clear persisted state
  useEffect(() => {
    return () => {
      if (simpleIntervalRef.current) clearInterval(simpleIntervalRef.current)
      if (pomIntervalRef.current) clearInterval(pomIntervalRef.current)
    }
  }, [])

  // Save config to localStorage
  function saveConfig(patch: Partial<typeof config>) {
    const updated = { ...config, ...patch }
    setConfig(updated)
    const full: Settings = {
      ...settings,
      pomodoroFocusMinutes: updated.focusMinutes,
      pomodoroBreakMinutes: updated.breakMinutes,
      pomodoroLongBreakMinutes: updated.longBreakMinutes,
      pomodoroCyclesBeforeLongBreak: updated.cycles,
      soundEnabled: updated.soundEnabled,
    }
    setSettings(full)
    saveSettings(full)
    const uid = localStorage.getItem('momentum-cloud-uid')
    if (uid) {
      import('../../lib/settings-sync').then(({ pushSettings }) => {
        const dashboardWidgets = JSON.parse(localStorage.getItem('momentum-dashboard-widgets') ?? '[]')
        const navPrefs = JSON.parse(localStorage.getItem('momentum-nav-prefs') ?? '{}')
        pushSettings(uid, full, dashboardWidgets, navPrefs)
      })
    }
  }

  // Simple timer
  function startSimple() {
    const now = Date.now()
    setSimpleStartedAt(now)
    const state: PersistedTimerState = {
      mode: 'simple',
      startedAt: now,
      phaseRemaining: null,
      phase: 'focus',
      cyclesCompleted: 0,
      config: configRef.current,
    }
    saveTimerState(state)
  }
  const { syncSession } = useSessionSync()

  async function stopSimple() {
    setSimpleStartedAt(null)
    clearTimerState()
    const total = simpleSeconds
    const actualSubjectId = projectId ? (data.projects.find((p) => p.id === projectId)?.subjectId ?? subjectId) : subjectId
    if (total >= 10 && actualSubjectId) {
      const task = taskId ? data.assignments.find((a) => a.id === taskId) : undefined
      const project = projectId ? data.projects.find((p) => p.id === projectId) : undefined
      const now = new Date()
      const start = new Date(now.getTime() - total * 1000)
      const session = {
        id: uuid(),
        subjectId: actualSubjectId,
        projectId: project?.id ?? null,
        assignmentId: task?.id ?? null,
        startAt: start.toISOString(),
        endAt: now.toISOString(),
        durationMinutes: Math.max(1, Math.round(total / 60)),
        note: task ? `Task: ${task.title}` : undefined,
        source: 'timer' as const,
        createdAt: isoNow(),
        updatedAt: isoNow(),
      }
      await db.sessions.add(session)
      const subjectName = data.subjects.find((s) => s.id === actualSubjectId)?.name ?? 'Unknown Subject'
      syncSession(session, subjectName)
      await updateRoutineLogsForSession(session)
      await loadData()
    }
    setSimpleSeconds(0)
  }

  // Pomodoro timer
  function startPomodoro() {
    const now = Date.now()
    setPomStartedAt(now)
    const state: PersistedTimerState = {
      mode: 'pomodoro',
      startedAt: now,
      phaseRemaining: getPhaseDuration(pomPhase, configRef.current),
      phase: pomPhase,
      cyclesCompleted: pomCycles,
      config: configRef.current,
    }
    saveTimerState(state)
  }

  function pausePomodoro() {
    setPomStartedAt(null)
    const state: PersistedTimerState = {
      mode: 'pomodoro',
      startedAt: null,
      phaseRemaining: pomSeconds,
      phase: pomPhase,
      cyclesCompleted: pomCycles,
      config: configRef.current,
    }
    saveTimerState(state)
  }

  function resetPomodoro() {
    setPomStartedAt(null)
    clearTimerState()
    setPomPhase('focus')
    setPomCycles(0)
    setPomSeconds(config.focusMinutes * 60)
  }

  const currentSeconds = mode === 'simple' ? simpleSeconds : pomSeconds
  const cycleLabel =
    pomPhase === 'focus' ? '🎯 Focus'
    : pomPhase === 'shortBreak' ? '☕ Short Break'
    : '🌿 Long Break'

  const isTimerActive = simpleStartedAt != null || pomStartedAt != null


  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>⏱️ Study Timer</CardTitle>
          {mode === 'pomodoro' && settings.pomodoroEnabled && (
            <button
              onClick={() => { if (!isTimerActive) setShowConfig(!showConfig) }}
              disabled={isTimerActive}
              className={cn(
                'rounded p-1.5 text-sm transition-colors',
                isTimerActive
                  ? 'text-slate-300 cursor-not-allowed dark:text-slate-600'
                  : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300'
              )}
              title={isTimerActive ? 'Stop timer to edit' : 'Configure pomodoro'}
            >
              ⚙️
            </button>
          )}
        </div>
      </CardHeader>

      {/* Config panel (gear) */}
      {showConfig && mode === 'pomodoro' && !isTimerActive && (
        <div className="mb-3 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-600 dark:bg-slate-800/50">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Focus</label>
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={config.focusMinutes === 1 ? '' : String(config.focusMinutes)}
                  onChange={(e) => { const v = e.target.value; if (v === '') { saveConfig({ focusMinutes: 1 }); return }; const n = Number(v); if (isNaN(n)) return; saveConfig({ focusMinutes: Math.max(1, n) }) }}
                  className="input w-16 text-center"
                />
                <span className="text-xs text-slate-500">min</span>
              </div>
            </div>
            <div>
              <label className="label">Short Break</label>
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={config.breakMinutes === 1 ? '' : String(config.breakMinutes)}
                  onChange={(e) => { const v = e.target.value; if (v === '') { saveConfig({ breakMinutes: 1 }); return }; const n = Number(v); if (isNaN(n)) return; saveConfig({ breakMinutes: Math.max(1, n) }) }}
                  className="input w-16 text-center"
                />
                <span className="text-xs text-slate-500">min</span>
              </div>
            </div>
            <div>
              <label className="label">Long Break</label>
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={config.longBreakMinutes === 1 ? '' : String(config.longBreakMinutes)}
                  onChange={(e) => { const v = e.target.value; if (v === '') { saveConfig({ longBreakMinutes: 1 }); return }; const n = Number(v); if (isNaN(n)) return; saveConfig({ longBreakMinutes: Math.max(1, n) }) }}
                  className="input w-16 text-center"
                />
                <span className="text-xs text-slate-500">min</span>
              </div>
            </div>
            <div>
              <label className="label">Cycles</label>
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  max={12}
                  value={config.cycles === 1 ? '' : String(config.cycles)}
                  onChange={(e) => { const v = e.target.value; if (v === '') { saveConfig({ cycles: 1 }); return }; const n = Number(v); if (isNaN(n)) return; saveConfig({ cycles: Math.max(1, Math.min(12, n)) }) }}
                  className="input w-16 text-center"
                />
                <span className="text-xs text-slate-500">× then long</span>
              </div>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-slate-500">Sound</span>
            <button
              onClick={() => saveConfig({ soundEnabled: !config.soundEnabled })}
              className={cn(
                'relative h-5 w-9 rounded-full transition-colors',
                config.soundEnabled ? 'bg-primary-600' : 'bg-slate-300 dark:bg-slate-600'
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
                  config.soundEnabled && 'translate-x-4'
                )}
              />
            </button>
          </div>
          <p className="mt-2 text-[10px] text-slate-400">
            Also editable in <a href="/settings" className="underline">Settings</a>
          </p>
        </div>
      )}

      {/* Mode toggle */}
      <div className="mb-3 flex gap-2">
        <button
          onClick={() => setMode('simple')}
          className={cn(
            'flex-1 rounded px-2 py-1 text-sm font-medium transition-colors',
            mode === 'simple'
              ? 'bg-primary-600 text-white'
              : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
          )}
        >
          Simple
        </button>
        {settings.pomodoroEnabled && (
          <button
            onClick={() => setMode('pomodoro')}
            className={cn(
              'flex-1 rounded px-2 py-1 text-sm font-medium transition-colors',
              mode === 'pomodoro'
                ? 'bg-primary-600 text-white'
                : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
            )}
          >
            Pomodoro
          </button>
        )}
      </div>

      {/* Phase indicator */}
      {mode === 'pomodoro' && settings.pomodoroEnabled && (
        <div className="mb-3 text-center text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {cycleLabel}
        </div>
      )}

      {/* Timer display */}
      <div className="text-center text-5xl font-bold tabular-nums text-slate-800 dark:text-slate-100">
        {fmt(currentSeconds)}
      </div>

      {/* Cycle indicator */}
      {mode === 'pomodoro' && settings.pomodoroEnabled && (
        <div className="mt-2 flex justify-center gap-1">
          {Array.from({ length: config.cycles }, (_, i) => (
            <div
              key={i}
              className={cn(
                'h-2 w-2 rounded-full',
                i < (pomCycles % config.cycles)
                  ? 'bg-primary-600'
                  : 'bg-slate-200 dark:bg-slate-700'
              )}
            />
          ))}
        </div>
      )}

      {/* Focus Area selectors */}
      <div className="mt-3 space-y-2">
        <div>
          <label className="label">Focus Area</label>
          <select
            className="input"
            value={subjectId}
            onChange={(e) => { setSubjectId(e.target.value); setProjectId(''); setTaskId('') }}
          >
            <option value="">— Select focus area —</option>
            {data.subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        {subjectId && (
          <div>
            <label className="label">Project (optional)</label>
            <select
              className="input"
              value={projectId}
              onChange={(e) => { setProjectId(e.target.value); setTaskId('') }}
            >
              <option value="">— Select project —</option>
              {data.projects.filter((p) => p.subjectId === subjectId).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}
        {projectId && (
          <div>
            <label className="label">Task (optional)</label>
            <select
              className="input"
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
            >
              <option value="">— Select task —</option>
              {data.assignments.filter((a) => a.projectId === projectId && !a.completed && !a.deletedAt).map((a) => (
                <option key={a.id} value={a.id}>{a.title}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="mt-3 flex justify-center gap-2">
        {mode === 'simple' ? (
          !simpleStartedAt ? (
            <Button variant="primary" onClick={startSimple} disabled={!subjectId && !projectId}>
              Start
            </Button>
          ) : (
            <Button variant="danger" onClick={stopSimple}>
              Stop & Save
            </Button>
          )
        ) : (
          <>
            {!pomStartedAt ? (
              <Button variant="primary" onClick={startPomodoro} disabled={!subjectId && !projectId}>
                Start
              </Button>
            ) : (
              <Button variant="secondary" onClick={pausePomodoro}>
                Pause
              </Button>
            )}
            <Button variant="secondary" onClick={resetPomodoro}>
              Reset
            </Button>
          </>
        )}
      </div>

      {!settings.pomodoroEnabled && (
        <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">
          Pomodoro hidden — enable in <a href="/settings" className="underline">Settings</a>
        </p>
      )}
    </Card>
  )
}
