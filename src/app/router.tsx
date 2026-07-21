import { lazy, Suspense } from 'react'
import { HashRouter, Link, Route, Routes, useLocation } from 'react-router-dom'
import { ErrorBoundary } from '../components/ui/ErrorBoundary'
import { AppLayout } from '../components/layout/AppLayout'
import { DataProvider } from './providers'
import { AuthProvider } from './auth-provider'
import { UndoProvider } from '../lib/use-undo'
const Dashboard = lazy(() => import('../features/dashboard/Dashboard'))
const SubjectsPage = lazy(() => import('../features/subjects/SubjectsPage'))
const ProjectsPage = lazy(() => import('../features/projects/ProjectsPage'))
const ProjectDetailPage = lazy(() => import('../features/projects/ProjectDetailPage'))
const ReportsPage = lazy(() => import('../features/reports/ReportsPage'))
const SettingsPage = lazy(() => import('../features/settings/SettingsPage'))
const MarksPage = lazy(() => import('../features/marks/MarksPage'))
const HabitsPage = lazy(() => import('../features/habits/HabitsPage'))
const CalendarPage = lazy(() => import('../features/calendar/CalendarPage'))
const CategoriesPage = lazy(() => import('../features/categories/CategoriesPage'))
const GroupsPage = lazy(() => import('../features/groups/GroupsPage'))
const GroupDetailPage = lazy(() => import('../features/groups/GroupDetailPage'))
const RoutinePage = lazy(() => import('../features/routines/RoutinePage'))
const ActivitiesPage = lazy(() => import('../features/activities/ActivitiesPage'))
const AIReviewPage = lazy(() => import('../features/reviews/AIReviewPage'))
const StudyPage = lazy(() => import('../features/study/StudyPage'))
const ReviewSessionPage = lazy(() => import('../features/study/ReviewSessionPage'))
const ReviewLogPage = lazy(() => import('../features/study/ReviewLogPage'))
const ExamConfigPage = lazy(() => import('../features/study/ExamConfigPage'))

function RouterContent() {
  const location = useLocation()
  return (
    <ErrorBoundary resetKey={location.pathname}>
      <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading…</div>}>
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
      </Suspense>
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
