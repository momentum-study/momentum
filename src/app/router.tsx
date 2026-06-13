import { HashRouter, Route, Routes } from 'react-router-dom'
import { AppLayout } from '../components/layout/AppLayout'
import { DataProvider } from './providers'
import { AuthProvider } from './auth-provider'
import Dashboard from '../features/dashboard/Dashboard'
import SubjectsPage from '../features/subjects/SubjectsPage'
import ProjectsPage from '../features/projects/ProjectsPage'
import ReportsPage from '../features/reports/ReportsPage'
import SettingsPage from '../features/settings/SettingsPage'
import MarksPage from '../features/marks/MarksPage'
import HabitsPage from '../features/habits/HabitsPage'
import CalendarPage from '../features/calendar/CalendarPage'
import CategoriesPage from '../features/categories/CategoriesPage'
import GroupsPage from '../features/groups/GroupsPage'
import GroupDetailPage from '../features/groups/GroupDetailPage'

export function AppRouter() {
  return (
    <HashRouter>
      <AuthProvider>
      <DataProvider>
            <AppLayout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/subjects" element={<SubjectsPage />} />
                <Route path="/projects" element={<ProjectsPage />} />
                <Route path="/marks" element={<MarksPage />} />
                <Route path="/habits" element={<HabitsPage />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/categories" element={<CategoriesPage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/groups" element={<GroupsPage />} />
                <Route path="/groups/:id" element={<GroupDetailPage />} />
              </Routes>
            </AppLayout>
          </DataProvider>
        </AuthProvider>
      </HashRouter>
  )
}
