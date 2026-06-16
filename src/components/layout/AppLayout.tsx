import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { UndoToast } from '../ui/UndoToast'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'

import { SyncBanner } from '../ui/SyncBanner'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '🏠' },
  { to: '/subjects', label: 'Focus Areas', icon: '📚' },
  { to: '/projects', label: 'Projects', icon: '🎯' },
  { to: '/routines', label: 'Routines', icon: '📋' },
  { to: '/marks', label: 'Marks', icon: '📝' },
  { to: '/habits', label: 'Habits', icon: '🔥' },
  { to: '/hobbies', label: 'Hobbies', icon: '🎨' },
  { to: '/groups', label: 'Groups', icon: '👥' },
  { to: '/calendar', label: 'Tasks', icon: '📅' },
  { to: '/categories', label: 'Categories', icon: '🗂️' },
  { to: '/reports', label: 'Reports', icon: '📈' },
  { to: '/reviews', label: 'AI Review', icon: '🤖' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
]

const PREFS_KEY = 'momentum-nav-prefs'

interface NavPrefs {
  order: string[]
  hidden: string[]
}

const DEFAULT_PREFS: NavPrefs = { order: [], hidden: [] }

function loadPrefs(): NavPrefs {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_PREFS }
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return { ...DEFAULT_PREFS }
    const parsed = JSON.parse(raw) as Partial<NavPrefs>
    const order = Array.isArray(parsed.order)
      ? parsed.order.filter((t): t is string => typeof t === 'string')
      : []
    const hidden = Array.isArray(parsed.hidden)
      ? parsed.hidden.filter((t): t is string => typeof t === 'string')
      : []
    return { order, hidden }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

function savePrefs(prefs: NavPrefs) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch { /* ignore */ }
}

/** Apply saved order/visibility to the base NAV_ITEMS, dropping unknowns and backfilling new ones. */
function applyPrefs(base: typeof NAV_ITEMS, prefs: NavPrefs): typeof NAV_ITEMS {
  const hidden = new Set(prefs.hidden)
  const baseByTo = new Map<string, (typeof base)[number]>()
  for (const item of base) baseByTo.set(item.to, item)
  const knownTos = new Set(base.map((item) => item.to))

  // Ordered list: saved order intersected with current nav, then anything from base not yet listed.
  const ordered: typeof NAV_ITEMS = []
  const seen = new Set<string>()
  for (const to of prefs.order) {
    if (!knownTos.has(to) || seen.has(to)) continue
    const item = baseByTo.get(to)
    if (item) {
      ordered.push(item)
      seen.add(to)
    }
  }
  for (const item of base) {
    if (!seen.has(item.to)) ordered.push(item)
  }

  return ordered.filter((item) => !hidden.has(item.to))
}

export function AppLayout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)')
    setIsMobile(mql.matches)
    function onChange(e: MediaQueryListEvent) { setIsMobile(e.matches) }
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])
  const [prefs, setPrefs] = useState<NavPrefs>(() => loadPrefs())
  const [draftPrefs, setDraftPrefs] = useState<NavPrefs | null>(null)
  const location = useLocation()

  const visibleItems = applyPrefs(NAV_ITEMS, prefs)

  function openCustomizer() {
    // Seed draft with current effective state so the dialog reflects what's live.
    const visibleTos = new Set(visibleItems.map((i) => i.to))
    setDraftPrefs({
      order: visibleItems.map((i) => i.to),
      hidden: NAV_ITEMS.map((i) => i.to).filter((to) => !visibleTos.has(to)),
    })
  }

  function closeCustomizer() {
    setDraftPrefs(null)
  }

  function applyCustomizer() {
    if (!draftPrefs) return
    setPrefs(draftPrefs)
    savePrefs(draftPrefs)
    setDraftPrefs(null)
  }

  function moveItem(to: string, direction: -1 | 1) {
    if (!draftPrefs) return
    setDraftPrefs((prev) => {
      if (!prev) return prev
      const order = [...prev.order]
      const idx = order.indexOf(to)
      if (idx === -1) return prev
      const target = idx + direction
      if (target < 0 || target >= order.length) return prev
      ;[order[idx], order[target]] = [order[target], order[idx]]
      return { ...prev, order }
    })
  }

  function toggleHidden(to: string) {
    if (!draftPrefs) return
    setDraftPrefs((prev) => {
      if (!prev) return prev
      const hidden = prev.hidden.includes(to)
        ? prev.hidden.filter((t) => t !== to)
        : [...prev.hidden, to]
      return { ...prev, hidden }
    })
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      <SyncBanner />
      <div className="flex flex-1 overflow-hidden">
      <aside
        className={cn(
          'hidden md:flex flex-col border-r border-slate-200 bg-white transition-all duration-200',
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
          {visibleItems.map((item) => (
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
              <span aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-200 px-2 py-2 dark:border-slate-700">
          <button
            onClick={openCustomizer}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100"
            aria-label="Customise navigation"
          >
            <span aria-hidden>🛠️</span>
            <span>Customise</span>
          </button>
        </div>
      </aside>

      {/* Mobile sidebar slide-over */}
      {isMobile && (
        <>
          {/* Backdrop */}
          <div
            className={cn(
              'fixed inset-0 z-30 bg-black/50 transition-opacity',
              mobileSidebarOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
            )}
            onClick={() => setMobileSidebarOpen(false)}
            aria-hidden="true"
          />
          {/* Slide-over panel */}
          <aside
            className={cn(
              'fixed left-0 top-0 z-40 flex h-full w-64 flex-col border-r border-slate-200 bg-white transition-transform duration-200',
              'dark:border-slate-700 dark:bg-slate-800',
              mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
            )}
          >
            <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <span className="text-lg font-semibold text-primary-600 dark:text-primary-400">
                Momentum
              </span>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
              {visibleItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileSidebarOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100'
                    )
                  }
                >
                  <span aria-hidden="true">{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </nav>
            <div className="border-t border-slate-200 px-2 py-2 dark:border-slate-700">
              <button
                onClick={() => { openCustomizer(); setMobileSidebarOpen(false) }}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                aria-label="Customise navigation"
              >
                <span aria-hidden>🛠️</span>
                <span>Customise</span>
              </button>
            </div>
          </aside>
        </>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center gap-4 border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-700 dark:bg-slate-800">
          <button
            onClick={() => isMobile ? setMobileSidebarOpen(!mobileSidebarOpen) : setSidebarOpen(!sidebarOpen)}
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
      </div>
      <UndoToast />
      <Modal
        open={draftPrefs !== null}
        onClose={closeCustomizer}
        title="Customise Navigation"
      >
        {draftPrefs && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Reorder items or hide them from the sidebar.
            </p>
            <ul className="space-y-1">
              {draftPrefs.order.map((to, idx) => {
                const item = NAV_ITEMS.find((n) => n.to === to)
                if (!item) return null
                const isHidden = draftPrefs.hidden.includes(to)
                return (
                  <li
                    key={to}
                    className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900"
                  >
                    <div className="flex flex-col">
                      <button
                        type="button"
                        onClick={() => moveItem(to, -1)}
                        disabled={idx === 0}
                        className="rounded px-1 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-slate-700"
                        aria-label={`Move ${item.label} up`}
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => moveItem(to, 1)}
                        disabled={idx === draftPrefs.order.length - 1}
                        className="rounded px-1 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-slate-700"
                        aria-label={`Move ${item.label} down`}
                      >
                        ▼
                      </button>
                    </div>
                    <span className="text-lg" aria-hidden>{item.icon}</span>
                    <span
                      className={cn(
                        'flex-1 text-sm font-medium',
                        isHidden && 'text-slate-400 line-through dark:text-slate-500'
                      )}
                    >
                      {item.label}
                    </span>
                    <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <input
                        type="checkbox"
                        checked={!isHidden}
                        onChange={() => toggleHidden(to)}
                        className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-700"
                      />
                      Show
                    </label>
                  </li>
                )
              })}
            </ul>
            <div className="flex justify-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
              <Button variant="secondary" size="sm" onClick={closeCustomizer}>
                Cancel
              </Button>
              <Button size="sm" onClick={applyCustomizer}>
                Done
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
