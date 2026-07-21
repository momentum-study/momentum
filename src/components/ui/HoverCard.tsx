import { useState, useRef, type ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface HoverCardProps {
  content: ReactNode
  children: ReactNode
  delay?: number
  className?: string
}

export function HoverCard({ content, children, delay = 300, className }: HoverCardProps) {
  const [visible, setVisible] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const timerRef = useRef<number | null>(null)
  const triggerRef = useRef<HTMLDivElement>(null)

  function show(_e: React.MouseEvent) {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (rect) {
        setPosition({ x: rect.right + 8, y: rect.top })
      }
      setVisible(true)
    }, delay)
  }

  function hide() {
    if (timerRef.current) clearTimeout(timerRef.current)
    setVisible(false)
  }

  return (
    <div ref={triggerRef} className="relative inline-block" onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {visible && (
        <div
          className={cn(
            'fixed z-50 rounded-lg border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-800 min-w-[200px] max-w-[300px]',
            className
          )}
          style={{ left: position.x, top: position.y }}
          onMouseEnter={() => { if (timerRef.current) clearTimeout(timerRef.current); setVisible(true) }}
          onMouseLeave={hide}
        >
          {content}
        </div>
      )}
    </div>
  )
}
