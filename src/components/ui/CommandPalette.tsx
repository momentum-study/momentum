import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { useData } from '../../app/providers'
import { Modal } from './Modal'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', group: 'Pages' },
  { to: '/subjects', label: 'Focus Areas', group: 'Pages' },
  { to: '/projects', label: 'Projects', group: 'Pages' },
  { to: '/routines', label: 'Routines', group: 'Pages' },
  { to: '/activities', label: 'Activities', group: 'Pages' },
  { to: '/calendar', label: 'Tasks', group: 'Pages' },
  { to: '/marks', label: 'Marks', group: 'Pages' },
  { to: '/habits', label: 'Habits', group: 'Pages' },
  { to: '/study', label: 'Study', group: 'Pages' },
  { to: '/groups', label: 'Groups', group: 'Pages' },
  { to: '/categories', label: 'Categories', group: 'Pages' },
  { to: '/reports', label: 'Reports', group: 'Pages' },
  { to: '/reviews', label: 'AI Review', group: 'Pages' },
  { to: '/settings', label: 'Settings', group: 'Pages' },
] as const

interface PaletteItem {
  id: string
  label: string
  group: string
  to?: string
  action?: () => void
}

function fuzzyMatch(query: string, text: string): boolean {
  const q = query.toLowerCase()
  const words = q.split(/\s+/).filter(Boolean)
  return words.every((w) => text.toLowerCase().includes(w))
}

export function useCommandPalette() {
  const [open, setOpen] = useState(false)
  const toggle = useCallback(() => setOpen((v) => !v), [])
  return { open, setOpen, toggle }
}

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { data } = useData()
  const { subjects, projects, habits } = data

  const items = useMemo<PaletteItem[]>(() => {
    const result: PaletteItem[] = []

    // Pages
    for (const nav of NAV_ITEMS) {
      result.push({ id: `page-${nav.to}`, label: nav.label, group: 'Pages', to: nav.to })
    }

    // Actions
    result.push(
      { id: 'action-log', label: 'Log study time', group: 'Actions', to: '/study' },
      { id: 'action-timer', label: 'Start timer', group: 'Actions', to: '/study' },
      {
        id: 'action-dark',
        label: 'Toggle dark mode',
        group: 'Actions',
        action: () => {
          document.documentElement.classList.toggle('dark')
        },
      },
    )

    // Subjects
    for (const s of subjects) {
      if (!s.deletedAt) {
        result.push({ id: `subject-${s.id}`, label: s.name, group: 'Focus Areas', to: '/subjects' })
      }
    }

    // Projects
    for (const p of projects) {
      if (!p.deletedAt) {
        result.push({ id: `project-${p.id}`, label: p.name, group: 'Projects', to: '/projects' })
      }
    }

    // Habits
    for (const h of habits) {
      if (!h.deletedAt) {
        result.push({ id: `habit-${h.id}`, label: h.name, group: 'Habits', to: '/habits' })
      }
    }

    // Keyboard shortcuts hint
    result.push({ id: 'hint-shortcuts', label: 'Keyboard shortcuts...', group: 'Help' })

    return result
  }, [subjects, projects, habits])

  const filtered = useMemo(() => {
    if (!query.trim()) return items
    return items.filter((item) => fuzzyMatch(query, item.label))
  }, [items, query])

  // Group filtered items
  const grouped = useMemo(() => {
    const groups: { group: string; items: PaletteItem[] }[] = []
    let current: { group: string; items: PaletteItem[] } | null = null
    for (const item of filtered) {
      if (!current || current.group !== item.group) {
        current = { group: item.group, items: [] }
        groups.push(current)
      }
      current.items.push(item)
    }
    return groups
  }, [filtered])

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  // Reset index when filtered results change
  useEffect(() => {
    setActiveIndex(0)
  }, [filtered.length])

  const selectItem = useCallback(
    (item: PaletteItem) => {
      if (item.action) {
        item.action()
      } else if (item.to) {
        navigate(item.to)
      }
      onClose()
    },
    [navigate, onClose],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => (i + 1) % filtered.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length)
      } else if (e.key === 'Enter' && filtered.length > 0) {
        e.preventDefault()
        selectItem(filtered[activeIndex]!)
      }
    },
    [filtered, activeIndex, selectItem],
  )

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelector(`[data-idx="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const isMac = typeof navigator !== 'undefined' && navigator.platform.startsWith('Mac')
  const shortcut = isMac ? '⌘K' : 'Ctrl+K'

  return (
    <Modal open={open} onClose={onClose}>
      <div className="flex flex-col gap-2" onKeyDown={handleKeyDown}>
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Type to search… (${shortcut} to close)`}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-primary-400"
          />
        </div>

        <div ref={listRef} className="max-h-80 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-400">No results found</p>
          )}
          {grouped.map((g) => (
            <div key={g.group}>
              <div className="px-2 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {g.group}
              </div>
              {g.items.map((item) => {
                const idx = filtered.indexOf(item)
                return (
                  <button
                    key={item.id}
                    data-idx={idx}
                    type="button"
                    onClick={() => selectItem(item)}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                      idx === activeIndex
                        ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700/50',
                    )}
                  >
                    {item.label}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}
