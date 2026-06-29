import { HashRouter, Link, Route, Routes, useLocation } from 'react-router-dom'
import { ErrorBoundary } from '../components/ui/ErrorBoundary'
import { AppLayout } from '../components/layout/AppLayout'
import { DataProvider } from './providers'
import { AuthProvider } from './auth-provider'
import { UndoProvider } from '../lib/use-undo'
import Dashboard from '../features/dashboard/Dashboard'
import SubjectsPage from '../features/subjects/SubjectsPage'
import ProjectsPage from '../features/projects/ProjectsPage'
import ProjectDetailPage from '../features/projects/ProjectDetailPage'
import ReportsPage from '../features/reports/ReportsPage'
import SettingsPage from '../features/settings/SettingsPage'
import MarksPage from '../features/marks/MarksPage'
import HabitsPage from '../features/habits/HabitsPage'
import CalendarPage from '../features/calendar/CalendarPage'
import CategoriesPage from '../features/categories/CategoriesPage'
import GroupsPage from '../features/groups/GroupsPage'
import GroupDetailPage from '../features/groups/GroupDetailPage'
import RoutinePage from '../features/routines/RoutinePage'
import ActivitiesPage from '../features/activities/ActivitiesPage'
import AIReviewPage from '../features/reviews/AIReviewPage'
import StudyPage from '../features/study/StudyPage'
import ReviewSessionPage from '../features/study/ReviewSessionPage'
import ReviewLogPage from '../features/study/ReviewLogPage'
import ExamConfigPage from '../features/study/ExamConfigPage'

function RouterContent() {
  const location = useLocation()
  return (
    <ErrorBoundary resetKey={location.pathname}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/subjects" element={<SubjectsPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/marks" element={<MarksPage />} />
        <Route path="/habits" element={<HabitsPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/categories" element={<CategoriesPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/reviews" element={<AIReviewPage />} />
        <Route path="/study" element={<StudyPage />} />
        <Route path="/study/review" element={<ReviewSessionPage />} />
        <Route path="/study/log" element={<ReviewLogPage />} />
        <Route path="/study/exam" element={<ExamConfigPage />} />
        <Route path="/routines" element={<RoutinePage />} />
        <Route path="/activities" element={<ActivitiesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/groups" element={<GroupsPage />} />
        <Route path="/groups/:id" element={<GroupDetailPage />} />
        <Route path="/projects/:id" element={<ProjectDetailPage />} />
        <Route path="*" element={<div className="flex flex-col items-center justify-center p-8 text-center"><h1 className="text-2xl font-bold text-slate-800 dark:text-white">Page Not Found</h1><p className="mt-2 text-slate-500">The page you're looking for doesn't exist.</p><Link to="/" className="mt-4 text-primary-600 hover:underline">Go to Dashboard</Link></div>} />
      </Routes>
    </ErrorBoundary>
  )
}

export function AppRouter() {
  return (
    <HashRouter>
      <AuthProvider>
        <UndoProvider>
          <DataProvider>
            <AppLayout>
              <RouterContent />
            </AppLayout>
          </DataProvider>
        </UndoProvider>
      </AuthProvider>
    </HashRouter>
  )
}
