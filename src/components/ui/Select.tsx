import { useState, useRef, useEffect } from 'react'
import { cn } from '../../lib/utils'

interface SelectOption {
  value: string
  label: string
  color?: string
  emoji?: string
}

interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function Select({ value, onChange, options, placeholder, className, disabled }: SelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = options.find((o) => o.value === value)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (disabled) {
    return (
      <div className={cn('w-full flex items-center justify-between px-3 py-2 border border-slate-300 dark:border-slate-600 rounded bg-slate-100 dark:bg-slate-800 text-slate-500', className)}>
        <span>{selected?.label ?? placeholder ?? 'Select…'}</span>
      </div>
    )
  }

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:border-slate-400 dark:hover:border-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
      >
        <span className="flex items-center gap-2 truncate">
          {selected?.emoji && <span>{selected.emoji}</span>}
          {selected?.color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: selected.color }} />}
          <span className="truncate">{selected?.label ?? placeholder ?? 'Select…'}</span>
        </span>
        <svg
          className={cn('w-4 h-4 text-slate-400 transition-transform flex-shrink-0', open && 'rotate-180')}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg max-h-60 overflow-y-auto">
          {options.length === 0 && (
            <div className="px-3 py-2 text-sm text-slate-500">No options</div>
          )}
          {options.map((opt) => {
            const isSelected = opt.value === value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false) }}
                className={cn(
                  'w-full text-left px-3 py-2 text-sm flex items-center gap-2',
                  isSelected ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300' : 'hover:bg-slate-100 dark:hover:bg-slate-700'
                )}
              >
                {opt.emoji && <span>{opt.emoji}</span>}
                {opt.color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: opt.color }} />}
                <span className="truncate">{opt.label}</span>
                {isSelected && (
                  <svg className="w-4 h-4 ml-auto text-primary-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
