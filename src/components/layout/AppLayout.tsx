import type { ReactNode } from 'react'
import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { UndoToast } from '../ui/UndoToast'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '🏠' },
  { to: '/subjects', label: 'Focus Areas', icon: '📚' },
  { to: '/projects', label: 'Projects', icon: '🎯' },
  { to: '/marks', label: 'Marks', icon: '📝' },
  { to: '/habits', label: 'Habits', icon: '🔥' },
  { to: '/groups', label: 'Groups', icon: '👥' },
  { to: '/calendar', label: 'Tasks', icon: '📅' },
  { to: '/categories', label: 'Categories', icon: '🗂️' },
  { to: '/reports', label: 'Reports', icon: '📈' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
]

export function AppLayout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const location = useLocation()

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      <aside
        className={cn(
          'flex flex-col border-r border-slate-200 bg-white transition-all duration-200',
          'dark:border-slate-700 dark:bg-slate-800',
          sidebarOpen ? 'w-56' : 'w-0 overflow-hidden border-r-0'
        )}
      >
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <span className="text-lg font-semibold text-primary-600 dark:text-primary-400">
            Momentum
          </span>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100'
                )
              }
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center gap-4 border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-700 dark:bg-slate-800">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
            aria-label="Toggle sidebar"
          >
            ☰
          </button>
          <h1 className="text-base font-medium text-slate-700 dark:text-slate-200">
            {NAV_ITEMS.find((n) => n.to === location.pathname)?.label ?? 'Momentum'}
          </h1>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
      <UndoToast />
      </div>
  )
}
