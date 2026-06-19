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

// Service worker registration is handled by ReloadPrompt's useRegisterSW hook.
// No need to call registerSW() here — that would register the SW twice.

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
