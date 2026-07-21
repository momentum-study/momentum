import { useCallback, useEffect } from 'react'
import { HashRouter } from 'react-router-dom'
import { AppRouter } from './app/router'
import { applyDarkMode, loadSettings } from './features/settings/SettingsPage'
import { seedDefaults } from './db/app-db'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { ReloadPrompt } from './components/ui/ReloadPrompt'
import { CommandPalette, useCommandPalette } from './components/ui/CommandPalette'

export function App() {
  const { open, setOpen, toggle } = useCommandPalette()

  const handler = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        toggle()
      }
    },
    [toggle],
  )

  useEffect(() => {
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [handler])

  useEffect(() => {
    applyDarkMode(loadSettings().darkMode)
    void seedDefaults()
  }, [])
  return (
    <ErrorBoundary>
      <HashRouter>
        <ReloadPrompt />
        <CommandPalette open={open} onClose={() => setOpen(false)} />
        <AppRouter />
      </HashRouter>
    </ErrorBoundary>
  )
}
