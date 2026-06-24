import { useEffect } from 'react'
import { AppRouter } from './app/router'
import { applyDarkMode, loadSettings } from './features/settings/SettingsPage'
import { seedDefaults } from './db/app-db'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { ReloadPrompt } from './components/ui/ReloadPrompt'

export function App() {
  useEffect(() => {
    applyDarkMode(loadSettings().darkMode)
    void seedDefaults()
  }, [])
  return (
    <ErrorBoundary>
      <ReloadPrompt />
      <AppRouter />
    </ErrorBoundary>
  )
}
