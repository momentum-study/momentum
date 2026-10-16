import { ReactNode, useRef } from 'react'
import { cn } from '../../lib/utils'
import { FREEFORM_MIN_W, FREEFORM_MIN_H } from '../../lib/freeform-layout'

interface FreeformWidgetProps {
  id: string
  label: string
  width: number
  height: number
  /** Commit a completed drag. Position is container-relative top-left. */
  onCommit?: (pos: { x: number; y: number }) => void
  /** Commit a completed resize. */
  onResize?: (size: { width: number; height: number }) => void
  onDragStart?: () => void
  onRemove?: () => void
  children: ReactNode
  className?: string
}

/**
 * Freeform-mode widget — pointer-driven drag/resize with zero React
 * re-renders during the gesture (styles are applied straight to the DOM
 * node; the final position/size is committed once on pointer-up).
 *
 * Drag preserves the grab-point offset and freezes the container rect at
 * grab time so mid-gesture reflows cannot teleport the widget.
 */
export function FreeformWidget({
  id,
  label,
  width,
  height,
  onCommit,
  onResize,
  onDragStart,
  onRemove,
  children,
  className,
}: FreeformWidgetProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)

  const onHeaderPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('button, input, select, textarea, a, [data-resize-handle]')) return
    e.preventDefault()
    e.stopPropagation()
    const widgetEl = (target.closest('[data-widget-id]') as HTMLElement | null) ?? rootRef.current
    if (!widgetEl) return
    // The gesture's coordinate space is the freeform CANVAS (the positioned
    // ancestor marked data-freeform-canvas), NOT the widget's own absolute
    // wrapper — offsetParent IS that wrapper, which made dx relative to a
    // moving origin and committed garbage positions.
    const container = (widgetEl.closest('[data-freeform-canvas]') as HTMLElement | null) ?? widgetEl
    const cRect = container.getBoundingClientRect()
    const widgetRect = widgetEl.getBoundingClientRect()
    const base = {
      grabPointerX: e.clientX - cRect.left + container.scrollLeft,
      grabPointerY: e.clientY - cRect.top + container.scrollTop,
      widgetBaseX: widgetRect.left - cRect.left + container.scrollLeft,
      widgetBaseY: widgetRect.top - cRect.top + container.scrollTop,
      containerLeft: cRect.left,
      containerTop: cRect.top,
      scrollLeft: container.scrollLeft,
      scrollTop: container.scrollTop,
    }
    onDragStart?.()

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - base.containerLeft + base.scrollLeft - base.grabPointerX
      const dy = ev.clientY - base.containerTop + base.scrollTop - base.grabPointerY
      if (rootRef.current) {
        rootRef.current.style.transform = `translate3d(${dx}px, ${dy}px, 0)`
        rootRef.current.style.transition = 'none'
        rootRef.current.style.zIndex = '50'
      }
    }
    const onUp = (ev: PointerEvent) => {
      const dx = ev.clientX - base.containerLeft + base.scrollLeft - base.grabPointerX
      const dy = ev.clientY - base.containerTop + base.scrollTop - base.grabPointerY
      if (rootRef.current) {
        rootRef.current.style.transform = ''
        rootRef.current.style.transition = ''
        rootRef.current.style.zIndex = ''
      }
      onCommit?.({
        x: Math.max(0, base.widgetBaseX + dx),
        y: Math.max(0, base.widgetBaseY + dy),
      })
      dragCleanup()
    }
    const dragCleanup = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const onResizePointerDown = (e: React.PointerEvent) => {
    if (!onResize) return
    e.preventDefault()
    e.stopPropagation()
    const start = { x: e.clientX, y: e.clientY, w: width, h: height }

    const onMove = (ev: PointerEvent) => {
      const newW = Math.max(FREEFORM_MIN_W, start.w + (ev.clientX - start.x))
      const newH = Math.max(FREEFORM_MIN_H, start.h + (ev.clientY - start.y))
      if (rootRef.current) {
        rootRef.current.style.width = `${newW}px`
        rootRef.current.style.height = `${newH}px`
        rootRef.current.style.transition = 'none'
        rootRef.current.style.zIndex = '50'
      }
    }
    const onUp = () => {
      const newW = parseFloat(rootRef.current?.style.width ?? '') || width
      const newH = parseFloat(rootRef.current?.style.height ?? '') || height
      onResize?.({ width: newW, height: newH })
      // Clear inline overrides on the NEXT frame so the committed state is
      // already rendered — no flash between inline style and class size.
      requestAnimationFrame(() => {
        if (rootRef.current) {
          rootRef.current.style.width = ''
          rootRef.current.style.height = ''
          rootRef.current.style.transition = ''
          rootRef.current.style.zIndex = ''
        }
      })
      resizeCleanup()
    }
    const resizeCleanup = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        'group/widget relative h-full w-full overflow-hidden rounded-lg border bg-white shadow-sm dark:bg-slate-800',
        'border-slate-200 dark:border-slate-700',
        className
      )}
      data-widget-id={id}
      onPointerDown={onHeaderPointerDown}
    >
      <div className="flex cursor-grab items-center justify-between border-b border-slate-100 px-2 py-1 active:cursor-grabbing dark:border-slate-700">
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
          </svg>
          <h3 className="select-none text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</h3>
        </div>
        <div className="flex items-center gap-1">
          {onRemove && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onRemove() }} onPointerDown={(e) => e.stopPropagation()}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200" aria-label="Remove widget">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <div className="h-[calc(100%-2.5rem)] overflow-hidden p-3">{children}</div>
      {onResize && (
        <div onPointerDown={onResizePointerDown} data-resize-handle
          className="absolute bottom-1 right-1 z-10 h-5 w-5 cursor-nwse-resize rounded-sm bg-slate-300 opacity-0 transition-opacity group-hover/widget:opacity-100 dark:bg-slate-600"
          aria-label="Resize widget" />
      )}
    </div>
  )
}