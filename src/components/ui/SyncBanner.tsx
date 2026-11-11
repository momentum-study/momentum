import { useEffect, useState } from 'react'
import { SYNC_FAILURE_EVENT } from '../../lib/sync-status'
import { useAuth } from '../../app/auth-provider'

const DISMISS_KEY = 'momentum-sync-banner-dismissed'

/**
 * Surfaces sync failures (quota, ad-blocker interference) reported by
 * `data-sync.ts` via `syncStatus.notifyFailure`.
 *
 * The standing "disable your ad-blocker" advisory is only shown to signed-in
 * users: sync does not run at all when signed out, so warning a first-time
 * visitor about a Brave Shields ad-blocker they may not even have is a false
 * alarm — and it sat above every page until dismissed (spec §10.77).
 */
export function SyncBanner() {
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [adBlockDismissed, setAdBlockDismissed] = useState(false)
  const { user, isLoading } = useAuth()

  useEffect(() => {
    setAdBlockDismissed(localStorage.getItem(DISMISS_KEY) === '1')
    const onSyncFailure = (e: Event) => {
      const detail = (e as CustomEvent).detail
      setErrorMessage(detail.message)
    }
    window.addEventListener(SYNC_FAILURE_EVENT, onSyncFailure)
    return () => window.removeEventListener(SYNC_FAILURE_EVENT, onSyncFailure)
  }, [])

  // A real failure is always worth showing. The speculative ad-block advisory
  // only makes sense once the user is signed in and sync is actually running.
  const showAdBlockWarning = !adBlockDismissed && !!user

  if (!errorMessage && !showAdBlockWarning) return null
  // Don't flash the advisory during the initial auth check.
  if (!errorMessage && isLoading) return null

  const isError = !!errorMessage

  return (
    <div className={`border-b px-4 py-2 text-sm ${
      isError
        ? 'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-900/30 dark:text-red-100'
        : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-100'
    }`}>
      <div className="mx-auto flex max-w-7xl items-start justify-between gap-3">
        <p>
          {errorMessage || 'Sync is paused. If you use an ad-blocker (including Brave Shields), allow this site so sync keeps working.'}
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