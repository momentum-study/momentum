import { useRegisterSW } from 'virtual:pwa-register/react'
import { useEffect } from 'react'

export function ReloadPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered:', r)
    },
    onRegisterError(error) {
      console.error('SW registration error', error)
    },
  })

  const close = () => {
    setOfflineReady(false)
    setNeedRefresh(false)
  }

  // Periodically force an update check every 60s to detect new versions.
  // HashRouter means no real page navigations occur, so SW won't auto-check.
  useEffect(() => {
    const id = setInterval(() => {
      navigator.serviceWorker
        .getRegistrations()
        .then(regs => regs.forEach(r => r.update().catch(() => {})))
        .catch(() => {})
    }, 60_000)
    return () => clearInterval(id)
  }, [])

  if (!offlineReady && !needRefresh) return null

  const isUpdate = needRefresh

  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-3 pointer-events-none"
    >
      <div className="pointer-events-auto w-full max-w-md rounded-lg border border-amber-300 bg-amber-50 p-4 shadow-lg dark:border-amber-800 dark:bg-amber-900/40">
        <div className="flex items-start gap-3">
          <p className="flex-1 text-sm font-medium text-amber-900 dark:text-amber-100">
            {isUpdate
              ? 'A new version is available.'
              : 'App is ready to work offline.'}
          </p>
          <div className="flex shrink-0 gap-2">
            {isUpdate && (
              <button
                className="rounded bg-amber-600 px-3 py-1 text-sm font-medium text-white hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600"
                onClick={() => updateServiceWorker(true)}
              >
                Reload
              </button>
            )}
            <button
              aria-label="Dismiss"
              className="rounded p-1 text-amber-700 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-800/50"
              onClick={close}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-4 w-4"
              >
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
