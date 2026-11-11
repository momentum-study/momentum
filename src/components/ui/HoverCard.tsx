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
        // The card is min-w-[200px]/max-w-[300px]; flipping to the left of the
        // trigger and clamping to the viewport keeps it on screen when the
        // trigger sits near the right edge (spec §10.79).
        const CARD_W = 300
        const GAP = 8
        const spaceRight = window.innerWidth - rect.right - GAP
        const x = spaceRight >= 200
          ? rect.right + GAP
          : Math.max(GAP, rect.left - GAP - CARD_W)
        const y = Math.min(Math.max(GAP, rect.top), Math.max(GAP, window.innerHeight - 180))
        setPosition({ x, y })
      }
      setVisible(true)
    }, delay)
  }

  function hide() {
    if (timerRef.current) clearTimeout(timerRef.current)
    setVisible(false)
  }

  // `min-w-0` lets the wrapper shrink inside a flex row so the child's
  // `truncate` actually applies instead of overflowing the card (§10.79).
  return (
    <div ref={triggerRef} className="relative inline-block min-w-0 max-w-full" onMouseEnter={show} onMouseLeave={hide}>
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
