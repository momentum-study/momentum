import { useEffect, useState } from 'react'
import { SYNC_FAILURE_EVENT } from '../../lib/sync-status'

const DISMISS_KEY = 'momentum-sync-banner-dismissed'

export function SyncBanner() {
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [adBlockDismissed, setAdBlockDismissed] = useState(false)

  useEffect(() => {
    setAdBlockDismissed(localStorage.getItem(DISMISS_KEY) === '1')
    const onSyncFailure = (e: Event) => {
      const detail = (e as CustomEvent).detail
      setErrorMessage(detail.message)
    }
    window.addEventListener(SYNC_FAILURE_EVENT, onSyncFailure)
    return () => window.removeEventListener(SYNC_FAILURE_EVENT, onSyncFailure)
  }, [])

  const showAdBlockWarning = !adBlockDismissed

  if (!errorMessage && !showAdBlockWarning) return null

  const isError = !!errorMessage

  return (
    <div className={`border-b px-4 py-2 text-sm ${
      isError
        ? 'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-900/30 dark:text-red-100'
        : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-100'
    }`}>
      <div className="mx-auto flex max-w-7xl items-start justify-between gap-3">
        <p>
          {errorMessage || "To keep sync between devices working reliably, please disable ad-blockers (including Brave Shields) for this site."}
        </p>
        <button
          type="button"
          className="shrink-0 rounded px-2 py-1 text-xs font-medium hover:bg-white/50 dark:hover:bg-black/20"
          onClick={() => {
            if (errorMessage) setErrorMessage(null)
            else {
              localStorage.setItem(DISMISS_KEY, '1')
              setAdBlockDismissed(true)
            }
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
