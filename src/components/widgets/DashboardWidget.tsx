import React, { ReactNode, Suspense, useRef, useState } from 'react'
import { getWidget } from '../../lib/widget-registry'
import { cn } from '../../lib/utils'

interface DashboardWidgetProps {
  id: string
  label: string
  size: 'small' | 'medium' | 'large'
  defaultOpen?: boolean
  onRemove?: () => void
  onReorder?: (fromId: string, toId: string) => void
  onSetSize?: (size: 'small' | 'medium' | 'large') => void
  children: ReactNode
  className?: string
}

export function DashboardWidget({
  id,
  label,
  defaultOpen = true,
  onRemove,
  onReorder,
  onSetSize,
  children,
  className,
}: DashboardWidgetProps) {
  const dragRef = useRef<HTMLDivElement>(null)
  const [isOpen, setIsOpen] = useState(defaultOpen)

  const handleDragStart = (e: React.DragEvent<HTMLElement>) => {
    e.dataTransfer.setData('text/plain', id)
    e.dataTransfer.effectAllowed = 'move'
    e.currentTarget.classList.add('opacity-50', 'border-dashed', 'border-2', 'border-primary-500')
  }

  const handleDragEnd = (e: React.DragEvent<HTMLElement>) => {
    e.currentTarget.classList.remove('opacity-50', 'border-dashed', 'border-2', 'border-primary-500')
  }

  const handleDragOver = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault()
    const fromId = e.dataTransfer.getData('text/plain')
    if (fromId && fromId !== id && onReorder) {
      onReorder(fromId, id)
    }
  }

  return (
    <div
      ref={dragRef}
      data-widget-id={id}
      className={cn(
        'relative bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden',
        'transition-all duration-200 ease-in-out h-full',
        className
      )}
    >
      <div
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className="flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-700 cursor-grab active:cursor-grabbing"
      >
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 select-none">{label}</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsOpen((v) => !v)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            aria-label={isOpen ? 'Collapse' : 'Expand'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ transform: isOpen ? 'none' : 'rotate(-90deg)', transition: 'transform 150ms' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {onRemove && (
            <button
              onClick={onRemove}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              aria-label="Remove widget"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
      {isOpen && <div className="p-3">{children}</div>}
      {onSetSize && (
        <div
          className="absolute bottom-0 right-0 h-5 w-5 cursor-se-resize opacity-60 hover:opacity-100 bg-slate-200 dark:bg-slate-700 rounded-tl-md flex items-center justify-center z-10"
          onMouseDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            const grid = e.currentTarget.closest('.grid') as HTMLElement
            if (!grid) return
            const colWidth = grid.offsetWidth / 3
            const widget = e.currentTarget.closest('[data-widget-id]') as HTMLElement
            const cell = widget?.parentElement as HTMLElement
            if (!cell) return

            function onMove(ev: MouseEvent) {
              const cols = Math.max(1, Math.min(3, Math.round((ev.clientX - grid.getBoundingClientRect().left) / colWidth)))
              cell.style.gridColumn = `span ${cols}`
            }

            function onUp(ev: MouseEvent) {
              document.removeEventListener('mousemove', onMove)
              document.removeEventListener('mouseup', onUp)
              const cols = Math.max(1, Math.min(3, Math.round((ev.clientX - grid.getBoundingClientRect().left) / colWidth)))
              cell.style.gridColumn = ''
              const sizes: ('small' | 'medium' | 'large')[] = ['small', 'medium', 'large']
              onSetSize?.(sizes[cols - 1])
            }

            document.addEventListener('mousemove', onMove)
            document.addEventListener('mouseup', onUp)
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-slate-500 dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 16l4-4M12 20l4-4M8 20l4-4" />
          </svg>
        </div>
      )}
    </div>
  )
}

export function DashboardRegistryWidget({ id }: { id: string }) {
  const def = getWidget(id)
  if (!def) return null
  const Component = def.component
  return (
    <Suspense fallback={<div className="p-4 text-center text-sm text-slate-500">Loading…</div>}>
      <Component />
    </Suspense>
  )
}