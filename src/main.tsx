import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './index.css'

declare const __BUILD_ID__: string

// Stamp the current build id onto window for support/debugging and to ensure
// each production build produces a distinct application bundle hash. This also
// helps the PWA service worker notice updates reliably.
if (typeof window !== 'undefined') {
  ;(window as Window & { __MOMENTUM_BUILD_ID__?: string }).__MOMENTUM_BUILD_ID__ = __BUILD_ID__
}

// BUG-185 guard: if the service worker served a stale precache (old JS bundle
// alongside new HTML), the build id stamped on window differs from the one we
// cached on the previous load. Force a clean reload so the new bundle is
// fetched and the mismatched state/prop shapes can't cause React error #185
// (e.g. dragging a dashboard widget between columns). This runs before render.
if (typeof window !== 'undefined' && import.meta.env.PROD) {
  const BUILD_ID_KEY = 'momentum-build-id'
  try {
    const cached = localStorage.getItem(BUILD_ID_KEY)
    if (cached && cached !== __BUILD_ID__) {
      localStorage.setItem(BUILD_ID_KEY, __BUILD_ID__)
      window.location.reload()
    } else {
      localStorage.setItem(BUILD_ID_KEY, __BUILD_ID__)
    }
  } catch {
    // localStorage unavailable (private mode) — skip the guard.
  }
}

// Service worker registration is handled by ReloadPrompt's useRegisterSW hook.
// No need to call registerSW() here — that would register the SW twice.

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
