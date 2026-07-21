import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface KbdProps {
  children: ReactNode
  className?: string
}

export function Kbd({ children, className }: KbdProps) {
  return (
    <kbd
      className={cn(
        'inline-block min-w-[1.5rem] px-1.5 py-0.5 text-[10px] font-mono text-slate-600 bg-slate-100 border border-slate-300 rounded dark:text-slate-300 dark:bg-slate-800 dark:border-slate-600',
        className
      )}
    >
      {children}
    </kbd>
  )
}
