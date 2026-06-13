import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './index.css'

if ('serviceWorker' in navigator) {
  void import('virtual:pwa-register').then(({ registerSW }) => {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        const toast = document.createElement('div')
        toast.className = 'fixed bottom-4 left-1/2 z-50 -translate-x-1/2 transform'
        toast.innerHTML = `
          <div class="flex items-center gap-3 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
            <span>New version available</span>
            <button class="rounded bg-white/20 px-2 py-1 font-medium hover:bg-white/30">Update</button>
          </div>
        `
        toast.querySelector('button')!.onclick = () => {
          void updateSW(true)
          toast.remove()
        }
        document.body.appendChild(toast)
        setTimeout(() => toast.remove(), 10000)
      },
      onOfflineReady() {
        console.log('Momentum is ready to work offline.')
      },
    })
  }).catch(() => {
    // virtual:pwa-register not available outside prod build
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
