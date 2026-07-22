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
  onToggleSize?: () => void
  children: ReactNode
  className?: string
}

export function DashboardWidget({
  id,
  label,
  size,
  defaultOpen = true,
  onRemove,
  onReorder,
  onToggleSize,
  children,
  className,
}: DashboardWidgetProps) {
  const dragRef = useRef<HTMLDivElement>(null)
  const [isOpen, setIsOpen] = useState(defaultOpen)

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('text/plain', id)
    e.dataTransfer.effectAllowed = 'move'
    e.currentTarget.classList.add('opacity-50', 'border-dashed', 'border-2', 'border-primary-500')
  }

  const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
    e.currentTarget.classList.remove('opacity-50', 'border-dashed', 'border-2', 'border-primary-500')
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const fromId = e.dataTransfer.getData('text/plain')
    if (fromId && fromId !== id && onReorder) {
      onReorder(fromId, id)
    }
  }

  return (
    <div
      ref={dragRef}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={cn(
        'bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden',
        'transition-all duration-200 ease-in-out cursor-grab active:cursor-grabbing h-full',
        className
      )}
    >
      <div className="flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-700">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 select-none">{label}</h3>
        <div className="flex items-center gap-1">
          {onToggleSize && (
            <button
              onClick={onToggleSize}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-xs px-1"
              aria-label={`Toggle size (${size})`}
              title={`Size: ${size}`}
            >
              {size === 'small' ? '⬚' : size === 'medium' ? '▭' : '▣'}
            </button>
          )}
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
