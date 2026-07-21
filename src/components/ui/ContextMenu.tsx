import { useState, useRef, useEffect, type ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { Kbd } from './Kbd'

export interface ContextMenuItem {
  label: string
  icon?: ReactNode
  shortcut?: string
  action: () => void
  danger?: boolean
  disabled?: boolean
  items?: ContextMenuItem[] // sub-menu
}

interface ContextMenuProps {
  items: ContextMenuItem[]
  children: ReactNode
}

export function ContextMenu({ items, children }: ContextMenuProps) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const menuRef = useRef<HTMLDivElement>(null)
  const longPressTimer = useRef<number | null>(null)
  const touchStartPos = useRef<{ x: number; y: number } | null>(null)

  // Close on click outside or Escape
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function handleContextMenu(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    let clientX: number
    let clientY: number
    if ('touches' in e) {
      const touch = e.touches[0]
      clientX = touch.clientX
      clientY = touch.clientY
    } else {
      clientX = e.clientX
      clientY = e.clientY
    }
    setPosition({ x: clientX, y: clientY })
    setOpen(true)
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    longPressTimer.current = window.setTimeout(() => {
      handleContextMenu(e)
      if (navigator.vibrate) navigator.vibrate(10)
    }, 500)
  }

  function handleTouchEnd() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  function handleTouchMove() {
    // Cancel long-press if user moves finger
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  return (
    <>
      <div
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
      >
        {children}
      </div>
      {open && (
        <div
          ref={menuRef}
          className="fixed z-50 rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800 min-w-[180px]"
          style={{
            left: Math.min(position.x, window.innerWidth - 200),
            top: Math.min(position.y, window.innerHeight - 300),
          }}
        >
          <ul className="py-1">
            {items.map((item, idx) => (
              <li key={idx}>
                {item.items ? (
                  // Sub-menu (simplified — would need nested positioning)
                  <div className="px-3 py-2 text-sm text-slate-400">
                    {item.label} →
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={item.disabled}
                    onClick={() => {
                      item.action()
                      setOpen(false)
                    }}
                    className={cn(
                      'w-full flex items-center justify-between gap-3 px-3 py-2 text-sm',
                      item.disabled
                        ? 'text-slate-400 cursor-not-allowed'
                        : item.danger
                        ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20'
                        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700'
                    )}
                  >
                    <span className="flex items-center gap-2">
                      {item.icon && <span className="text-base">{item.icon}</span>}
                      {item.label}
                    </span>
                    {item.shortcut && <Kbd>{item.shortcut}</Kbd>}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
