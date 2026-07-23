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
    const channel = new BroadcastChannel(UPDATE_CHANNEL)
    channel.addEventListener('message', () => setBroadcastUpdate(true))
    return () => channel.close()
  }, [])

  // When this tab detects an update via useRegisterSW, broadcast to other tabs.
  useEffect(() => {
    if (!needRefresh) return
    const channel = new BroadcastChannel(UPDATE_CHANNEL)
    channel.postMessage({ type: 'update-available' })
    channel.close()
  }, [needRefresh])

  const close = useCallback(() => {
    setOfflineReady(false)
    setNeedRefresh(false)
    setBroadcastUpdate(false)
  }, [setOfflineReady, setNeedRefresh])

  // Auto-reload when an update is available — don't require user click.
  // registerType: 'autoUpdate' installs the new SW immediately, but a reload
  // is still needed to start serving the new assets.
  useEffect(() => {
    if (needRefresh) {
      updateServiceWorker(true)
    }
  }, [needRefresh, updateServiceWorker])

  // Periodically force an update check every 60s to detect new versions.
  const showPrompt = needRefresh || broadcastUpdate
  useEffect(() => {
    const interval = setInterval(() => {
      void updateServiceWorker(false)
    }, 60_000)
    return () => clearInterval(interval)
  }, [updateServiceWorker])

  if (!offlineReady && !showPrompt) return null

  return (
    <div
      role="alert"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 shadow-lg"
    >
      <div className="text-sm text-slate-700 dark:text-slate-200">
        {needRefresh || broadcastUpdate
          ? 'New version available. Reloading…'
          : 'App ready to work offline.'}
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