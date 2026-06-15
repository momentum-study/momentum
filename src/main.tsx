import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './index.css'

// Service worker registration is handled by ReloadPrompt's useRegisterSW hook.
// No need to call registerSW() here — that would register the SW twice.

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
