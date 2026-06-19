import { useEffect, useRef, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { v4 as uuid } from 'uuid'
import { useData } from '../../app/providers'
import { db } from '../../db/app-db'
import { Button } from '../ui/Button'
import { Card, CardHeader, CardTitle } from '../ui/Card'
import { cn, isoNow } from '../../lib/utils'
import { loadSettings, saveSettings } from '../../features/settings/SettingsPage'
import type { Settings } from '../../features/settings/SettingsPage'
import { useSessionSync } from '../../lib/use-session-sync'
import { updateRoutineLogsForSession, updateStreakDayForSession } from '../../lib/routine-tracker'
import { clearTimerState, loadTimerState, saveTimerState, savePendingSession, loadPendingSession, clearPendingSession } from '../../lib/timer-persistence'
import type { PersistedTimerState, PendingSession } from '../../lib/timer-persistence'

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
  const [changeSubjectOpen, setChangeSubjectOpen] = useState(false)
  const [changeSubjectConfirmation, setChangeSubjectConfirmation] = useState('')
  const changeSubjectConfirmationTimer = useRef<number | null>(null)

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
    if (saved?.mode === 'pomodoro' && saved.startedAt) {
      // Compute remaining time from wall clock to avoid 00:00 → real value flicker
      const cfg = saved.config ?? settings
      const duration = getPhaseDuration(saved.phase, cfg)
      const elapsed = Math.floor((Date.now() - saved.startedAt) / 1000)
      return Math.max(0, duration - elapsed)
    }
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
  const dataRef = useRef(data)
  dataRef.current = data

  useEffect(() => {
    if (!subjectId && data.subjects[0]) setSubjectId(data.subjects[0].id)
  }, [data.subjects, subjectId])

  // Recover any session that was saved to localStorage on page close but not
  // yet committed to Dexie (e.g. browser killed the tab before the async write).
  useEffect(() => {
    const pending = loadPendingSession()
    if (!pending) return
    clearPendingSession()
    const session = {
      id: uuid(),
      subjectId: pending.subjectId,
      projectId: pending.projectId,
      assignmentId: pending.assignmentId,
      startAt: pending.startAt,
      endAt: pending.endAt,
      durationMinutes: pending.durationMinutes,
      note: pending.note,
      source: pending.source,
      createdAt: isoNow(),
      updatedAt: isoNow(),
    }
    void db.sessions.add(session).then(async () => {
      const subjectName = data.subjects.find((s) => s.id === pending.subjectId)?.name ?? 'Unknown Subject'
      syncSession(session, subjectName)
      await updateRoutineLogsForSession(session)
      await updateStreakDayForSession(session)
      await loadData()
    })
  }, [])

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
    const subjects = dataRef.current.subjects
    const projects = dataRef.current.projects
    const assignments = dataRef.current.assignments

    if (pomPhase === 'focus') {
      // Save the completed focus session
      const actualSubjId = st.projectId ? (projects.find((p) => p.id === st.projectId)?.subjectId ?? st.subjectId) : st.subjectId
      if (actualSubjId) {
        const task = st.taskId ? assignments.find((a) => a.id === st.taskId) : undefined
        const project = st.projectId ? projects.find((p) => p.id === st.projectId) : undefined
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
          const subjectName = subjects.find((s) => s.id === actualSubjId)?.name ?? 'Unknown Subject'
          syncSession(session, subjectName)
          await updateRoutineLogsForSession(session)
          await updateStreakDayForSession(session)
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
  // eslint-disable-next-line react-hooks/exhaustive-deps

  // Cleanup on unmount: clear intervals but DON'T clear persisted state
  useEffect(() => {
    return () => {
      if (simpleIntervalRef.current) clearInterval(simpleIntervalRef.current)
      if (pomIntervalRef.current) clearInterval(pomIntervalRef.current)
      if (changeSubjectConfirmationTimer.current) clearTimeout(changeSubjectConfirmationTimer.current)
    }
  }, [])
  // Auto-save on visibility change / page close.
  // The Dexie write is async, so the browser may not wait for it before
  // killing the tab. We save a synchronous pending session to localStorage
  // FIRST so the data is never lost, then attempt the async Dexie write.
  // On next mount, the pending session is recovered and committed.
  useEffect(() => {
    function buildPendingSession(): PendingSession | null {
      if (simpleStartedAt) {
        const total = simpleSeconds
        const actualSubjId = projectId
          ? (dataRef.current.projects.find((p) => p.id === projectId && !p.deletedAt)?.subjectId ?? subjectId)
          : subjectId
        if (total >= 10 && actualSubjId) {
          const project = projectId ? dataRef.current.projects.find((p) => p.id === projectId && !p.deletedAt) : undefined
          const task = taskId ? dataRef.current.assignments.find((a) => a.id === taskId) : undefined
          const now = new Date()
          const start = new Date(now.getTime() - total * 1000)
          return {
            subjectId: actualSubjId,
            projectId: project?.id ?? null,
            assignmentId: task?.id ?? null,
            startAt: start.toISOString(),
            endAt: now.toISOString(),
            durationMinutes: Math.max(1, Math.round(total / 60)),
            note: task ? `Task: ${task.title}` : undefined,
            source: 'timer',
          }
        }
      } else if (pomStartedAt && pomPhase === 'focus') {
        const actualSubjId = projectId
          ? (dataRef.current.projects.find((p) => p.id === projectId && !p.deletedAt)?.subjectId ?? subjectId)
          : subjectId
        if (actualSubjId) {
          const project = projectId ? dataRef.current.projects.find((p) => p.id === projectId && !p.deletedAt) : undefined
          const task = taskId ? dataRef.current.assignments.find((a) => a.id === taskId) : undefined
          const elapsedMs = Date.now() - pomStartedAt
          const start = new Date(pomStartedAt)
          const end = new Date()
          return {
            subjectId: actualSubjId,
            projectId: project?.id ?? null,
            assignmentId: task?.id ?? null,
            startAt: start.toISOString(),
            endAt: end.toISOString(),
            durationMinutes: Math.max(1, Math.round(elapsedMs / 60000)),
            note: task ? `Task: ${task.title}` : undefined,
            source: 'pomodoro',
          }
        }
      }
      return null
    }
    function handleVisibilityChange() {
      if (document.visibilityState !== 'hidden') return
      const pending = buildPendingSession()
      if (pending) savePendingSession(pending)
      // Best-effort async commit; pending session covers us if it doesn't complete
      if (simpleStartedAt) void stopSimple()
      else if (pomStartedAt && pomPhase === 'focus') void resetPomodoro()
    }
    function handleBeforeUnload() {
      const pending = buildPendingSession()
      if (pending) savePendingSession(pending)
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [simpleStartedAt, pomStartedAt, pomPhase, simpleSeconds, subjectId, projectId, taskId])

  // Update document.title when timer is running
  const isRunning = simpleStartedAt !== null || pomStartedAt !== null
  useEffect(() => {
    if (!isRunning) { document.title = 'Momentum'; return }
    document.title = simpleStartedAt !== null ? `${fmt(simpleSeconds)} — Momentum` : `${fmt(pomSeconds)} — Momentum`
    return () => { document.title = 'Momentum' }
  }, [isRunning, simpleSeconds, pomSeconds])

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
    const actualSubjectId = projectId ? (data.projects.find((p) => p.id === projectId && !p.deletedAt)?.subjectId ?? subjectId) : subjectId
    if (total >= 10 && actualSubjectId) {
      const task = taskId ? data.assignments.find((a) => a.id === taskId) : undefined
      const project = projectId ? data.projects.find((p) => p.id === projectId && !p.deletedAt) : undefined
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
      await updateStreakDayForSession(session)
      await loadData()
    }
    setSimpleSeconds(0)
  }

  async function changeSubject(newSubjectId: string) {
    if (newSubjectId === subjectId) {
      setChangeSubjectOpen(false)
      return
    }
    const oldName = data.subjects.find((s) => s.id === subjectId)?.name ?? 'Unknown'
    const newName = data.subjects.find((s) => s.id === newSubjectId)?.name ?? 'Unknown'
    const elapsed = mode === 'simple' ? simpleSeconds : currentSeconds
    if (mode === 'simple') {
      // Save current simple session
      const actualSubjectId = projectId ? (data.projects.find((p) => p.id === projectId && !p.deletedAt)?.subjectId ?? subjectId) : subjectId
      if (elapsed >= 10 && actualSubjectId) {
        const task = taskId ? data.assignments.find((a) => a.id === taskId) : undefined
        const project = projectId ? data.projects.find((p) => p.id === projectId && !p.deletedAt) : undefined
        const now = new Date()
        const start = new Date(now.getTime() - elapsed * 1000)
        const session = {
          id: uuid(),
          subjectId: actualSubjectId,
          projectId: project?.id ?? null,
          assignmentId: task?.id ?? null,
          startAt: start.toISOString(),
          endAt: now.toISOString(),
          durationMinutes: Math.max(1, Math.round(elapsed / 60)),
          note: task ? `Task: ${task.title}` : undefined,
          source: 'timer' as const,
          createdAt: isoNow(),
          updatedAt: isoNow(),
        }
        await db.sessions.add(session)
        const subjectName = data.subjects.find((s) => s.id === actualSubjectId)?.name ?? 'Unknown Subject'
        syncSession(session, subjectName)
        await updateRoutineLogsForSession(session)
        await updateStreakDayForSession(session)
        await loadData()
      }
      setSimpleSeconds(0)
    } else {
      // Save current pomodoro focus session (only if focus phase and has been running)
      if (pomPhase === 'focus' && pomStartedAt) {
        const actualSubjId = projectId ? (data.projects.find((p) => p.id === projectId && !p.deletedAt)?.subjectId ?? subjectId) : subjectId
        if (actualSubjId) {
          const task = taskId ? data.assignments.find((a) => a.id === taskId) : undefined
          const project = projectId ? data.projects.find((p) => p.id === projectId && !p.deletedAt) : undefined
          const startMs = pomStartedAt
          const elapsedMs = Date.now() - startMs
          const partialMinutes = Math.max(1, Math.round(elapsedMs / 60000))
          const start = new Date(startMs)
          const end = new Date()
          const session = {
            id: uuid(),
            subjectId: actualSubjId,
            projectId: project?.id ?? null,
            assignmentId: task?.id ?? null,
            startAt: start.toISOString(),
            endAt: end.toISOString(),
            durationMinutes: partialMinutes,
            note: task ? `Task: ${task.title}` : undefined,
            source: 'pomodoro' as const,
            createdAt: isoNow(),
            updatedAt: isoNow(),
          }
          await db.sessions.add(session)
          const subjectName = data.subjects.find((s) => s.id === actualSubjId)?.name ?? 'Unknown Subject'
          syncSession(session, subjectName)
          await updateRoutineLogsForSession(session)
          await updateStreakDayForSession(session)
          await loadData()
        }
      }
    }
    // Switch subject and start new session
    setSubjectId(newSubjectId)
    setProjectId('')
    setTaskId('')
    const now = Date.now()
    if (mode === 'simple') {
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
    } else {
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
    setChangeSubjectOpen(false)
    setChangeSubjectConfirmation(`Switched from ${oldName} to ${newName}`)
    if (changeSubjectConfirmationTimer.current) clearTimeout(changeSubjectConfirmationTimer.current)
    changeSubjectConfirmationTimer.current = window.setTimeout(() => setChangeSubjectConfirmation(''), 3000)
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

  async function resetPomodoro() {
    // Save partial focus session before discarding
    if (pomPhase === 'focus' && pomStartedAt) {
      const actualSubjId = projectId ? (data.projects.find((p) => p.id === projectId && !p.deletedAt)?.subjectId ?? subjectId) : subjectId
      if (actualSubjId) {
        const task = taskId ? data.assignments.find((a) => a.id === taskId) : undefined
        const project = projectId ? data.projects.find((p) => p.id === projectId && !p.deletedAt) : undefined
        const startMs = pomStartedAt
        const elapsedMs = Date.now() - startMs
        const partialMinutes = Math.max(1, Math.round(elapsedMs / 60000))
        const start = new Date(startMs)
        const end = new Date()
        const session = {
          id: uuid(),
          subjectId: actualSubjId,
          projectId: project?.id ?? null,
          assignmentId: task?.id ?? null,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          durationMinutes: partialMinutes,
          note: task ? `Task: ${task.title}` : undefined,
          source: 'pomodoro' as const,
          createdAt: isoNow(),
          updatedAt: isoNow(),
        }
        await db.sessions.add(session)
        const subjectName = data.subjects.find((s) => s.id === actualSubjId)?.name ?? 'Unknown Subject'
        syncSession(session, subjectName)
        await updateRoutineLogsForSession(session)
        await updateStreakDayForSession(session)
        await loadData()
      }
    }
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
                  value={String(config.focusMinutes)}
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
                  value={String(config.breakMinutes)}
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
                  value={String(config.longBreakMinutes)}
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
                  value={String(config.cycles)}
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
      {/* Break indicator */}
      {mode === 'pomodoro' && settings.pomodoroEnabled && (pomPhase === 'shortBreak' || pomPhase === 'longBreak') && (() => {
        const subjectName = data.subjects.find((s) => s.id === subjectId)?.name
        return (
          <div className="mb-3 text-center text-sm text-slate-600 dark:text-slate-300">
            {pomPhase === 'shortBreak' ? 'Short' : 'Long'} break{subjectName ? ` from ${subjectName}` : ''}
          </div>
        )
      })()}

      {/* Timer display */}
      <div className="text-center text-5xl font-bold tabular-nums text-slate-800 dark:text-slate-100">
        {fmt(currentSeconds)}
      </div>

      {/* Cycle indicator - larger dots with numbers */}
      {mode === 'pomodoro' && settings.pomodoroEnabled && (
        <div className="mt-2 flex justify-center gap-2">
          {Array.from({ length: config.cycles }, (_, i) => {
            const completedCycles = pomCycles % config.cycles
            const completed = i < completedCycles
            return (
              <div
                key={i}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full border-2',
                  completed
                    ? 'border-primary-600 bg-primary-600 text-white'
                    : 'border-slate-300 dark:border-slate-600'
                )}
              >
                {completed ? i + 1 : ''}
              </div>
            )
          })}
        </div>
      )}

      {/* Recent Sessions */}
      {mode === 'pomodoro' && settings.pomodoroEnabled && (
        <div className="mt-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Recent Sessions</h3>
          <div className="space-y-2">
            {data.sessions.filter((s) => s.source === 'pomodoro').slice(0, 3).map((session) => {
              const subject = data.subjects.find((s) => s.id === session.subjectId)
              return (
                <div key={session.id} className="flex items-center gap-2 text-xs">
                  <div
                    className={cn(
                      'h-2 w-2 rounded-full',
                      subject?.color ?? 'bg-slate-400'
                    )}
                  />
                  <span className="truncate text-slate-700 dark:text-slate-300">{subject?.name ?? 'Unknown'}</span>
                  <span className="text-slate-500 dark:text-slate-400">{session.durationMinutes}m</span>
                  <span className="ml-auto text-slate-400">{formatDistanceToNow(new Date(session.startAt), { addSuffix: true })}</span>
                </div>
              )
            })}
            {data.sessions.filter((s) => s.source === 'pomodoro').length === 0 && (
              <p className="text-xs text-slate-400 dark:text-slate-500">No sessions yet</p>
            )}
          </div>
        </div>
      )}

      {/* Focus Area selectors — collapse when timer is running */}
      <div className="mt-3 space-y-2">
        {(!pomStartedAt && !simpleStartedAt) ? (
          <>
            <div>
              <label className="label">Focus Area</label>
              <select
                className="input"
                value={subjectId}
                onChange={(e) => { setSubjectId(e.target.value); setProjectId(''); setTaskId('') }}
              >
                <option value="">— Select focus area —</option>
                {data.subjects.filter(s => !s.deletedAt).map((s) => (
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
                  {data.projects.filter((p) => p.subjectId === subjectId && !p.deletedAt).map((p) => (
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
          </>
        ) : (
          <div className="text-sm text-slate-600 dark:text-slate-300">
            Studying <span className="font-semibold">{data.subjects.find((s) => s.id === subjectId)?.name}</span>
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

      {/* Change Subject — only when timer is running */}
      {isTimerActive && (
        <div className="mt-2 flex flex-col items-center gap-1">
          {!changeSubjectOpen ? (
            <button
              type="button"
              onClick={() => setChangeSubjectOpen(true)}
              className="text-xs text-primary-600 hover:underline dark:text-primary-400"
            >
              Change Subject
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <select
                className="input w-48"
                value={subjectId}
                onChange={(e) => { void changeSubject(e.target.value) }}
                autoFocus
              >
                <option value="">— Select new subject —</option>
                {data.subjects.filter((s) => s.id !== subjectId && !s.deletedAt).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setChangeSubjectOpen(false)}
                className="text-xs text-slate-500 hover:underline"
              >
                Cancel
              </button>
            </div>
          )}
          {changeSubjectConfirmation && (
            <p className="text-xs text-green-600 dark:text-green-400">{changeSubjectConfirmation}</p>
          )}
        </div>
      )}

      {!settings.pomodoroEnabled && (
        <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">
          Pomodoro hidden — enable in <a href="/settings" className="underline">Settings</a>
        </p>
      )}
    </Card>
  )
}
