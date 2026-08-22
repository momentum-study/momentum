import { useState, useRef, useEffect, type ReactNode } from 'react'
import { cn } from '../../lib/utils'

export interface KebabMenuItem {
  label: string
  icon?: ReactNode
  shortcut?: string
  action: () => void
  danger?: boolean
  disabled?: boolean
}

interface KebabMenuProps {
  items: KebabMenuItem[]
  className?: string
  ariaLabel?: string
}

export function KebabMenu({ items, className, ariaLabel = 'More actions' }: KebabMenuProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className={cn('relative inline-block', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
      >
        <span className="block text-lg leading-none">⋯</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            ref={menuRef}
            role="menu"
            className="absolute right-0 z-30 mt-1 w-40 rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-800"
          >
            {items.map((item, i) => (
              <button
                key={i}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  if (!item.disabled) {
                    item.action()
                    setOpen(false)
                  }
                }}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left',
                  item.disabled
                    ? 'cursor-not-allowed text-slate-300 dark:text-slate-600'
                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700',
                  item.danger && !item.disabled && 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20'
                )}
              >
                {item.icon && <span className="shrink-0">{item.icon}</span>}
                <span className="flex-1">{item.label}</span>
                {item.shortcut && (
                  <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">{item.shortcut}</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
