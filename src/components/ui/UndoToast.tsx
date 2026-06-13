// Toast that appears at the bottom of the screen after an action, offering
// an Undo button. Pressing Ctrl+Z also triggers undo, Ctrl+Shift+Z for redo.
import { useUndo } from '../../lib/use-undo'

export function UndoToast() {
  const { lastDescription, undo, dismiss } = useUndo()
  if (!lastDescription) return null
  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 transform">
      <div className="flex items-center gap-3 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-slate-100 dark:text-slate-900">
        <span>{lastDescription}</span>
        <button
          onClick={() => void undo()}
          className="rounded bg-white/20 px-2 py-1 font-medium hover:bg-white/30 dark:bg-slate-900/20 dark:hover:bg-slate-900/30"
        >
          Undo
        </button>
        <button
          onClick={dismiss}
          className="text-white/70 hover:text-white dark:text-slate-900/70 dark:hover:text-slate-900"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  )
}