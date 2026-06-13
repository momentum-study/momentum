// Global undo stack with Ctrl+Z / Cmd+Z support.
// Operations register themselves before mutating the database; the user can
// revert the most recent action via Ctrl+Z. A toast confirms the undo.
//
// Scope: small-scale per-user data (hundreds of records). Each undo snapshots
// the previous state of the affected record(s) — this is fine for a personal
// study app, but would need a real change-log for larger data sets.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

interface UndoAction {
  description: string
  undo: () => Promise<void>
  timestamp: number
}

interface UndoContextValue {
  /** Push a new action onto the stack. The undo function is called on Ctrl+Z. */
  push: (action: Omit<UndoAction, 'timestamp'>) => void
  /** Trigger the most recent undo. No-op if stack is empty. */
  undo: () => Promise<void>
  /** True if there is anything to undo. */
  canUndo: boolean
  /** Most recent action description, for the toast. */
  lastDescription: string | null
  /** Manually dismiss the current toast. */
  dismiss: () => void
}

const UndoContext = createContext<UndoContextValue | null>(null)

const MAX_UNDO_DEPTH = 50

export function UndoProvider({ children }: { children: ReactNode }) {
  const stack = useRef<UndoAction[]>([])
  const [version, setVersion] = useState(0) // bump to trigger re-renders
  const [toast, setToast] = useState<UndoAction | null>(null)
  const toastTimer = useRef<number | null>(null)

  const push = useCallback((action: Omit<UndoAction, 'timestamp'>) => {
    const full: UndoAction = { ...action, timestamp: Date.now() }
    stack.current.push(full)
    if (stack.current.length > MAX_UNDO_DEPTH) {
      stack.current.shift()
    }
    setToast(full)
    setVersion((v) => v + 1)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 6000)
  }, [])

  const dismiss = useCallback(() => {
    setToast(null)
    if (toastTimer.current) {
      window.clearTimeout(toastTimer.current)
      toastTimer.current = null
    }
  }, [])

  const undo = useCallback(async () => {
    const action = stack.current.pop()
    if (!action) return
    try {
      await action.undo()
    } catch (e) {
      console.error('Undo failed:', e)
    }
    dismiss()
    setVersion((v) => v + 1)
  }, [dismiss])

  // Global Ctrl+Z / Cmd+Z listener. Ignore when the user is typing in an
  // input/textarea — let the browser handle its own text-field undo.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isUndoCombo = (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z'
      if (!isUndoCombo) return
      const target = e.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) {
          return
        }
      }
      e.preventDefault()
      void undo()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo])

  const value = useMemo<UndoContextValue>(
    () => ({
      push,
      undo,
      dismiss,
      canUndo: stack.current.length > 0,
      lastDescription: toast?.description ?? null,
    }),
    // version is referenced to re-compute canUndo
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [push, undo, dismiss, toast, version]
  )

  return <UndoContext.Provider value={value}>{children}</UndoContext.Provider>
}

export function useUndo() {
  const ctx = useContext(UndoContext)
  if (!ctx) throw new Error('useUndo must be used within UndoProvider')
  return ctx
}
