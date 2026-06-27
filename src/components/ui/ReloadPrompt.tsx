import { useRegisterSW } from 'virtual:pwa-register/react'
import { useCallback, useEffect, useState } from 'react'

const UPDATE_CHANNEL = 'momentum-sw-update'

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

  // Local override so cross-tab BroadcastChannel messages can show the prompt
  // even in tabs where useRegisterSW hasn't detected the new SW yet.
  const [broadcastUpdate, setBroadcastUpdate] = useState(false)

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel(UPDATE_CHANNEL)
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'update-available') {
        setBroadcastUpdate(true)
        // Also tell the SW to skipWaiting so this tab reloads cleanly when the user clicks Reload.
        navigator.serviceWorker?.getRegistration().then(reg => {
          reg?.waiting?.postMessage({ type: 'SKIP_WAITING' })
        }).catch(() => {})
      }
    }
    channel.addEventListener('message', onMessage)
    return () => {
      channel.removeEventListener('message', onMessage)
      channel.close()
    }
  }, [])

  // When this tab detects an update via useRegisterSW, broadcast to other tabs.
  useEffect(() => {
    if (!needRefresh) return
    if (typeof BroadcastChannel === 'undefined') return
    try {
      const channel = new BroadcastChannel(UPDATE_CHANNEL)
      channel.postMessage({ type: 'update-available' })
      channel.close()
    } catch {}
  }, [needRefresh])

  const close = useCallback(() => {
    setOfflineReady(false)
    setNeedRefresh(false)
    setBroadcastUpdate(false)
    setPollStopped(true)
  }, [setOfflineReady, setNeedRefresh])

  // Periodically force an update check every 60s to detect new versions.
  // HashRouter means no real page navigations occur, so SW won't auto-check.
  // The poll runs continuously while the page is open. Once the user has
  // dismissed the prompt (close() called), we stop polling — no point
  // hammering the SW after they've chosen to stay on the current version.
  const [pollStopped, setPollStopped] = useState(false)
  const showPrompt = needRefresh || broadcastUpdate
  useEffect(() => {
    if (pollStopped) return
    const id = setInterval(() => {
      navigator.serviceWorker
        .getRegistrations()
        .then(regs => regs.forEach(r => r.update().catch(() => {})))
        .catch(() => {})
    }, 60_000)
    return () => clearInterval(id)
  }, [pollStopped])

  if (!offlineReady && !showPrompt) return null

  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-3 pointer-events-none"
    >
      <div className="pointer-events-auto w-full max-w-md rounded-lg border border-amber-300 bg-amber-50 p-4 shadow-lg dark:border-amber-800 dark:bg-amber-900/40">
        <div className="flex items-start gap-3">
          <p className="flex-1 text-sm font-medium text-amber-900 dark:text-amber-100">
            {showPrompt
              ? 'A new version is available.'
              : 'App is ready to work offline.'}
          </p>
          <div className="flex shrink-0 gap-2">
            {showPrompt && (
              <button
                className="rounded bg-amber-600 px-3 py-1 text-sm font-medium text-white hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600"
                onClick={() => {
                  setBroadcastUpdate(false)
                  void updateServiceWorker(true)
                  // Fallback: if the SW was already activated (e.g. via BroadcastChannel
                  // skip-waiting), updateServiceWorker won't trigger a reload on its own.
                  setTimeout(() => window.location.reload(), 500)
                }}
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
