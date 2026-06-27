import { useState, useCallback, type ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface CollapsibleProps {
  id: string // localStorage key (e.g. "collapsible-good-habits")
  title: string
  count?: number
  badge?: string // short label like "today" or "new"
  defaultOpen: boolean
  accent?: string // hex color for the left accent line
  children: ReactNode
}

function getStored(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(`collapsible-${key}`)
    if (raw !== null) return raw === 'true'
  } catch {}
  return fallback
}

export function Collapsible({ id, title, count, badge, defaultOpen, accent, children }: CollapsibleProps) {
  const [open, setOpen] = useState(() => getStored(id, defaultOpen))

  const toggle = useCallback(() => {
    setOpen((o) => {
      const next = !o
      try { localStorage.setItem(`collapsible-${id}`, String(next)) } catch {}
      return next
    })
  }, [id])

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        {/* Chevron */}
        <svg
          className={cn(
            'h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 dark:text-slate-500',
            open && 'rotate-90'
          )}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
        </svg>

        {/* Accent line */}
        {accent && (
          <span className="block h-4 w-1 rounded-full shrink-0" style={{ backgroundColor: accent }} />
        )}

        {/* Title */}
        <span className="flex-1 text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
          {title}
        </span>

        {/* Badge */}
        {badge && (
          <span className="rounded-full bg-primary-100 px-2 py-0.5 text-[10px] font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
            {badge}
          </span>
        )}

        {/* Count */}
        {count !== undefined && (
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            {count}
          </span>
        )}
      </button>

      {/* Animated content (grid-rows hack for CSS-only accordion) */}
      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-in-out',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
      >
        <div className={cn(open ? '' : 'overflow-hidden')}>
          <div className="pt-2 pb-1">{children}</div>
        </div>
      </div>
    </div>
  )
}
