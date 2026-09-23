// Shared drag state for the per-column dashboard grid. Lives outside React
// so updates from dnd-kit's pointer callbacks don't trigger re-renders on
// every pointer move; readers bridge the values into React via
// useSyncExternalStore. Two events drive re-renders during a drag:
//   - 'draghover': over-column or over-widget changed (placeholder index)
//   - 'dragmeasure': the active widget's measured size changed
// SortableContext item arrays are memoized separately, so these
// re-renders don't cause the context to re-register and the 200ms
// transform transitions don't re-fire (that was the source of the
// earlier flicker).

export const overColumn$ = { current: null as number | null }
export const overId$ = { current: null as string | null }
export const activeWidgetSize$ = { current: null as { height: number } | null }

export function subscribeDragHover(cb: () => void): () => void {
  window.addEventListener('draghover', cb)
  window.addEventListener('dragmeasure', cb)
  return () => {
    window.removeEventListener('draghover', cb)
    window.removeEventListener('dragmeasure', cb)
  }
}


// Throttle drag-hover events: a fast cross-column drag can cross every
// column boundary within a few frames, firing many draghover events. Each
// event re-renders the dashboard (useSyncExternalStore bridge), and each
// re-render can change SortableContext items, which makes dnd-kit fire
// onDragOver again — a feedback loop that manifests as Minified React
// error #185 ("Maximum update depth exceeded"). One event per animation
// frame is plenty for placeholder tracking.
let rafId: number | null = null
function emitNow(): void {
  rafId = null
  window.dispatchEvent(new Event('draghover'))
}
export function emitDragHover(): void {
  if (rafId != null) return
  rafId = requestAnimationFrame(emitNow)
}

export function emitDragMeasure(): void {
  window.dispatchEvent(new Event('dragmeasure'))
}

export function resetDragState(): void {
  overColumn$.current = null
  overId$.current = null
  activeWidgetSize$.current = null
  emitDragHover()
}
