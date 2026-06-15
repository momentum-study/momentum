import { useEffect, useState } from 'react'
import { useAuth } from '../../app/auth-provider'

const DISMISS_KEY = 'momentum-sync-banner-dismissed'

export function SyncBanner() {
  const { user } = useAuth()
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (typeof localStorage === 'undefined') return
    setDismissed(localStorage.getItem(DISMISS_KEY) === '1')
  }, [])

  if (!user || dismissed) return null

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-100">
      <div className="mx-auto flex max-w-7xl items-start justify-between gap-3">
        <p>
          To keep sync between devices working reliably, please disable ad-blockers (including Brave Shields) for this site.
        </p>
        <button
          type="button"
          className="shrink-0 rounded px-2 py-1 text-xs font-medium hover:bg-amber-100 dark:hover:bg-amber-800/50"
          onClick={() => {
            if (typeof localStorage !== 'undefined') localStorage.setItem(DISMISS_KEY, '1')
            setDismissed(true)
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
