import { useEffect } from 'react'
import { AppRouter } from './app/router'
import { applyDarkMode, loadSettings } from './features/settings/SettingsPage'
import { seedDefaults } from './db/app-db'
import { ReloadPrompt } from './components/ui/ReloadPrompt'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
export function App() {
  useEffect(() => {
    applyDarkMode(loadSettings().darkMode)
    void seedDefaults()
  }, [])
  return (
    <ErrorBoundary>
      <AppRouter />
      <ReloadPrompt />
    </ErrorBoundary>
  )
}
