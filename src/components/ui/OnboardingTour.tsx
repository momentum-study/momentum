import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from './Button'

const TOUR_KEY = 'momentum-tour-completed'

interface Step {
  title: string
  description: string
  /** Optional element selector for cutout highlight */
  target?: string
  /** Route to navigate to before showing this step */
  route?: string
}

const STEPS: Step[] = [
  {
    title: 'Welcome to Momentum',
    description: 'Your personal study tracker. Let us show you around!',
  },
  {
    title: 'Dashboard',
    description: 'This is your main hub. Widgets show your progress, streaks, and more.',
    target: '[data-tour="dashboard"]',
    route: '/',
  },
  {
    title: 'Timer',
    description: 'Start a pomodoro timer from the study page. Press Cmd+Shift+T to toggle.',
    target: '[data-tour="timer"]',
    route: '/study',
  },
  {
    title: 'Focus Areas',
    description: 'Organize your subjects here. Track progress for each focus area.',
    target: '[data-tour="subjects"]',
    route: '/subjects',
  },
  {
    title: 'You\'re Ready!',
    description: 'Use Cmd+K to open the command palette, or explore the sidebar. Happy studying!',
  },
]

export function OnboardingTour() {
  const [completed, setCompleted] = useState(() => {
    if (typeof localStorage === 'undefined') return true
    return localStorage.getItem(TOUR_KEY) === 'true'
  })
  const [activeStep, setActiveStep] = useState(0)
  const [visible, setVisible] = useState(false)
  const navigate = useNavigate()
  const overlayRef = useRef<HTMLDivElement>(null)

  // Show tour after a short delay on first load
  useEffect(() => {
    if (!completed) {
      const timer = setTimeout(() => setVisible(true), 500)
      return () => clearTimeout(timer)
    }
  }, [completed])

  // Navigate to step's route when step changes
  useEffect(() => {
    const step = STEPS[activeStep]
    if (step?.route && visible) {
      navigate(step.route)
    }
  }, [activeStep, visible, navigate])

  // Focus trap for a11y
  useEffect(() => {
    if (!visible) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        skip()
      } else if (e.key === 'Enter') {
        next()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [visible, activeStep])

  function next() {
    if (activeStep >= STEPS.length - 1) {
      complete()
    } else {
      setActiveStep((s) => s + 1)
    }
  }

  function skip() {
    complete()
  }

  function complete() {
    setVisible(false)
    setCompleted(true)
    try {
      localStorage.setItem(TOUR_KEY, 'true')
    } catch {}
  }

  // Allow replay from settings
  useEffect(() => {
    function onReplay() {
      try {
        localStorage.removeItem(TOUR_KEY)
      } catch {}
      setCompleted(false)
      setActiveStep(0)
      setVisible(true)
    }
    window.addEventListener('momentum:replay-tour', onReplay)
    return () => window.removeEventListener('momentum:replay-tour', onReplay)
  }, [])

  if (!visible) return null

  const step = STEPS[activeStep]
  if (!step) return null

  // Try to find target element for cutout
  let targetRect: DOMRect | null = null
  if (step.target) {
    const el = document.querySelector(step.target)
    if (el) {
      targetRect = el.getBoundingClientRect()
    }
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Onboarding: ${step.title}`}
    >
      {/* Semi-transparent overlay */}
      <div className="absolute inset-0 bg-black/60" onClick={skip} aria-hidden="true" />

      {/* Cutout around target (if found) */}
      {targetRect && (
        <div
          className="absolute rounded-lg ring-2 ring-primary-500 ring-offset-2"
          style={{
            top: targetRect.top - 8,
            left: targetRect.left - 8,
            width: targetRect.width + 16,
            height: targetRect.height + 16,
          }}
          aria-hidden="true"
        />
      )}

      {/* Card */}
      <div className="relative z-10 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-slate-800">
        {/* Step counter */}
        <div className="mb-4 flex items-center gap-2">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full ${
                i <= activeStep ? 'bg-primary-500' : 'bg-slate-200 dark:bg-slate-700'
              }`}
              aria-hidden="true"
            />
          ))}
        </div>

        <h2 className="mb-2 text-lg font-semibold text-slate-800 dark:text-slate-100">
          {step.title}
        </h2>
        <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
          {step.description}
        </p>

        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">
            Step {activeStep + 1} of {STEPS.length}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={skip}>
              Skip
            </Button>
            <Button size="sm" onClick={next}>
              {activeStep >= STEPS.length - 1 ? 'Finish' : 'Next'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
