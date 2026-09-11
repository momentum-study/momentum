import { useRegisterSW } from 'virtual:pwa-register/react'
import { useEffect, useState } from 'react'

export function ReloadPrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return
      window.setInterval(() => {
        void registration.update()
      }, 60_000)
    },
    onRegisterError(error) {
      console.error('SW registration error', error)
    },
  })
  const [reloaded, setReloaded] = useState(false)

  useEffect(() => {
    if (!needRefresh || reloaded) return
    setReloaded(true)
    void updateServiceWorker(true).then(() => window.location.reload())
  }, [needRefresh, reloaded, updateServiceWorker])

  return null
}
