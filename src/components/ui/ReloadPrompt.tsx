import { useRegisterSW } from 'virtual:pwa-register/react'
import { useCallback, useEffect } from 'react'

export function ReloadPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered:', r)
    },
    onRegisterError(error) {
      console.error('SW registration error', error)
    },
  })

  // Force reload when the new service worker takes control.
  // This handles the case where autoUpdate activates the new SW
  // but the current page is still using old assets.
  useEffect(() => {
    function onControllerChange() {
      window.location.reload()
    }
    navigator.serviceWorker?.addEventListener('controllerchange', onControllerChange)
    return () => {
      navigator.serviceWorker?.removeEventListener('controllerchange', onControllerChange)
    }
  }, [])

  const close = useCallback(() => {
    setOfflineReady(false)
  }, [setOfflineReady])

  if (!offlineReady) return null

  return (
    <div
      role="alert"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 shadow-lg"
    >
      <div className="text-sm text-slate-700 dark:text-slate-200">
        App ready to work offline.
      </div>
      <button
        onClick={close}
        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-xs"
        aria-label="Close"
      >
        ×
      </button>
    </div>
  )
}