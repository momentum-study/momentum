import { useState, useEffect, useCallback } from 'react'
import {
  type FreeformBox, type FreeformRect,
  FREEFORM_GAP, compactFreeform, clampToBounds, resolvePlacement,
} from './freeform-layout'

export interface WidgetConfig {
  id: string
  label: string
  cols: number
  rows: number
  /** Which column (0, 1, or 2) the widget sits in for grid mode. */
  column: number
  /** Order within the column. */
  order: number
  width?: number
  height?: number
  x?: number
  y?: number
}

export const MIN_WIDGET_COLS = 1
export const MAX_WIDGET_COLS = 3
export const MIN_WIDGET_ROWS = 1
export const MAX_WIDGET_ROWS = 3

export type LayoutMode = 'grid' | 'freeform'
export const LAYOUT_STORAGE_KEY = 'momentum-dashboard-layout-mode'

/** Default freeform pixel sizes (w × h) per widget, used on first switch. */
export const DEFAULT_FREEFORM_SIZE: Record<string, { width: number; height: number }> = {
  today: { width: 480, height: 360 },
  'today-checklist': { width: 340, height: 420 },
  pomodoro: { width: 360, height: 340 },
  'study-review': { width: 340, height: 240 },
  calendar: { width: 480, height: 340 },
  recent: { width: 480, height: 400 },
  assignments: { width: 340, height: 320 },
  'study-streak': { width: 560, height: 460 },
}

export const DASHBOARD_WIDGETS_METADATA: { id: string; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'today-checklist', label: "Today's Checklist" },
  { id: 'pomodoro', label: 'Study Timer' },
  { id: 'study-review', label: 'Study Review' },
  { id: 'calendar', label: 'Study Calendar' },
  { id: 'recent', label: 'Recent Sessions' },
  { id: 'assignments', label: 'Upcoming Assignments' },
  { id: 'study-streak', label: 'Study Streak' },
]

export const DEFAULT_CONFIGS: Record<string, Omit<WidgetConfig, 'id' | 'label'>> =
  DASHBOARD_WIDGETS_METADATA.reduce((acc, w, i) => {
    let cols = 1, rows = 1
    if (w.id === 'today' || w.id === 'calendar' || w.id === 'recent') { cols = 2; rows = 1 }
    if (w.id === 'study-streak') { cols = 2; rows = 2 }
    // Spread defaults across 3 columns so column 0 isn't empty on first load.
    const column = Math.min(2, Math.floor((i / DASHBOARD_WIDGETS_METADATA.length) * 3))
    acc[w.id] = { cols, rows, column, order: i }
    return acc
  }, {} as Record<string, Omit<WidgetConfig, 'id' | 'label'>>)
export const DEFAULT_WIDGET_IDS = DASHBOARD_WIDGETS_METADATA.map((w) => w.id)

/**
 * Seed a freeform layout for `ids` with no saved positions: wrap rows at
 * `containerWidth` (falling back to 1000px), reading each widget's default
 * size. Used on the very first switch to freeform mode.
 */
export function seedFreeformLayout(ids: string[], containerWidth: number): Record<string, FreeformRect> {
  const maxRow = Math.max(360, Math.round(containerWidth || 1000))
  const out: Record<string, FreeformRect> = {}
  let cursorX = 0
  let cursorY = 0
  let rowHeight = 0
  for (const id of ids) {
    const size = DEFAULT_FREEFORM_SIZE[id] ?? { width: 360, height: 280 }
    const width = Math.min(size.width, maxRow)
    if (cursorX > 0 && cursorX + width > maxRow) {
      cursorX = 0
      cursorY += rowHeight + FREEFORM_GAP
      rowHeight = 0
    }
    out[id] = { x: cursorX, y: cursorY, width, height: size.height }
    cursorX += width + FREEFORM_GAP
    rowHeight = Math.max(rowHeight, size.height)
  }
  return out
}

/** Convert configs to boxes for the layout engine, using default sizes when unset. */
export function readFreeformBoxes(
  configs: Record<string, Omit<WidgetConfig, 'id' | 'label'>>,
  ids: string[],
): FreeformBox[] {
  return ids.map((id, i) => {
    const cfg = configs[id] ?? DEFAULT_CONFIGS[id] ?? { cols: 1, rows: 1, column: 0, order: i }
    const size = DEFAULT_FREEFORM_SIZE[id] ?? { width: 360, height: 280 }
    return {
      id,
      order: cfg.order ?? i,
      x: cfg.x ?? 0,
      y: cfg.y ?? 0,
      width: cfg.width ?? size.width,
      height: cfg.height ?? size.height,
    }
  })
}

/** Write boxes back into configs (x/y/width/height only; grid fields untouched). */
function writeFreeformBoxes(
  configs: Record<string, Omit<WidgetConfig, 'id' | 'label'>>,
  boxes: FreeformBox[],
): Record<string, Omit<WidgetConfig, 'id' | 'label'>> {
  const next = { ...configs }
  for (const b of boxes) {
    next[b.id] = {
      ...(next[b.id] ?? DEFAULT_CONFIGS[b.id] ?? { cols: 1, rows: 1, column: 0, order: b.order }),
      x: b.x, y: b.y, width: b.width, height: b.height,
    }
  }
  return next
}

export function useDashboardWidgets() {
  const [visibleWidgets, setVisibleWidgets] = useState<string[]>(() => {
    if (typeof localStorage === 'undefined') return DEFAULT_WIDGET_IDS
    try {
      const saved = localStorage.getItem('momentum-dashboard-widgets')
      if (!saved) return DEFAULT_WIDGET_IDS
      const parsed = JSON.parse(saved)
      if (!Array.isArray(parsed)) return DEFAULT_WIDGET_IDS
      const validIds = new Set(DASHBOARD_WIDGETS_METADATA.map((w) => w.id))
      return parsed.filter((id: string) => validIds.has(id))
    } catch {
      return DEFAULT_WIDGET_IDS
    }
  })

  const [widgetConfigs, setWidgetConfigs] = useState<Record<string, Omit<WidgetConfig, 'id' | 'label'>>>(() => {
    if (typeof localStorage === 'undefined') return DEFAULT_CONFIGS
    try {
      const saved = localStorage.getItem('momentum-dashboard-configs')
      return saved ? JSON.parse(saved) : DEFAULT_CONFIGS
    } catch {
      return DEFAULT_CONFIGS
    }
  })

  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => {
    if (typeof localStorage === 'undefined') return 'grid'
    try {
      return localStorage.getItem(LAYOUT_STORAGE_KEY) === 'freeform' ? 'freeform' : 'grid'
    } catch {
      return 'grid'
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('momentum-dashboard-widgets', JSON.stringify(visibleWidgets))
      localStorage.setItem('momentum-dashboard-configs', JSON.stringify(widgetConfigs))
      localStorage.setItem(LAYOUT_STORAGE_KEY, layoutMode)
    } catch { /* ignore */ }
  }, [visibleWidgets, widgetConfigs, layoutMode])

  const reorderWidgets = useCallback((fromId: string, toId: string) => {
    setVisibleWidgets((prev) => {
      const result = [...prev]
      const fromIndex = result.indexOf(fromId)
      const toIndex = result.indexOf(toId)
      if (fromIndex === -1 || toIndex === -1) return prev
      result.splice(fromIndex, 1)
      result.splice(toIndex, 0, fromId)
      return result
    })
  }, [])

  // Move a widget to a specific column at a specific position within that
  // column. Reorders the visible list and rewrites the widget's column +
  // order config so it renders in the destination column.
  const moveWidgetToColumn = useCallback((widgetId: string, toColumn: number, beforeId?: string | null) => {
    const toCol = Math.max(0, Math.min(2, Math.floor(toColumn)))
    setVisibleWidgets((prev) => {
      const fromIndex = prev.indexOf(widgetId)
      if (fromIndex === -1) return prev
      const without = prev.filter((id) => id !== widgetId)
      let insertAt = without.length
      if (beforeId) {
        const idx = without.indexOf(beforeId)
        if (idx !== -1) insertAt = idx
      }
      const next = [...without.slice(0, insertAt), widgetId, ...without.slice(insertAt)]
      // Persist the column assignment so it survives reload.
      setWidgetConfigs((cfg) => {
        const cur = cfg[widgetId] ?? DEFAULT_CONFIGS[widgetId] ?? { cols: 1, rows: 1, column: 0, order: 0 }
        // Re-normalize order within each column so the render order is stable.
        const updated: Record<string, Omit<WidgetConfig, 'id' | 'label'>> = { ...cfg, [widgetId]: { ...cur, column: toCol } }
        // Compute per-column order from the visible list.
        const byCol: Record<number, string[]> = { 0: [], 1: [], 2: [] }
        for (const id of next) {
          const c = updated[id] ?? DEFAULT_CONFIGS[id] ?? { cols: 1, rows: 1, column: 0, order: 0 }
          byCol[c.column] = byCol[c.column] || []
          byCol[c.column].push(id)
        }
        for (let col = 0; col < 3; col++) {
          for (let i = 0; i < byCol[col].length; i++) {
            const id = byCol[col][i]
            updated[id] = { ...(updated[id] ?? DEFAULT_CONFIGS[id] ?? { cols: 1, rows: 1, column: col, order: i }), order: i }
          }
        }
        return updated
      })
      return next
    })
  }, [])

  const setWidgetSize = useCallback((id: string, cols: number, rows: number) => {
    setWidgetConfigs((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] ?? DEFAULT_CONFIGS[id]),
        cols: Math.max(MIN_WIDGET_COLS, Math.min(MAX_WIDGET_COLS, cols)),
        rows: Math.max(MIN_WIDGET_ROWS, Math.min(MAX_WIDGET_ROWS, rows)),
      },
    }))
  }, [])

  // ── Freeform mode ──

  /** Switch layout modes. Switching to freeform seeds positions when none saved. */
  const setLayoutModeWithSeed = useCallback((mode: LayoutMode, containerWidth?: number) => {
    if (mode === 'freeform') {
      setWidgetConfigs((prev) => {
        if (typeof localStorage === 'undefined') return prev
        let ids = visibleWidgets
        try {
          const saved = JSON.parse(localStorage.getItem('momentum-dashboard-widgets') ?? 'null')
          if (Array.isArray(saved)) ids = saved.filter((id: string) => DEFAULT_CONFIGS[id])
        } catch { /* ignore */ }
        const hasAny = ids.some((id) => prev[id]?.x != null && prev[id]?.y != null)
        if (hasAny) return prev
        const seeded = seedFreeformLayout(ids, containerWidth ?? 1000)
        return writeFreeformBoxes(prev, ids.map((id) => ({
          id, order: prev[id]?.order ?? 0,
          x: seeded[id].x, y: seeded[id].y, width: seeded[id].width, height: seeded[id].height,
        })))
      })
    }
    setLayoutMode(mode)
  }, [visibleWidgets])

  /**
   * Commit a drag: clamp the final rect into bounds, then resolve overlaps
   * against the fixed other widgets. Other widgets never move.
   */
  const commitFreeformRect = useCallback(
    (id: string, rect: FreeformRect, containerWidth: number) => {
      setWidgetConfigs((prev) => {
        const ids = typeof localStorage === 'undefined'
          ? visibleWidgets
          : (() => {
            try {
              const saved = JSON.parse(localStorage.getItem('momentum-dashboard-widgets') ?? 'null')
              return Array.isArray(saved) ? saved.filter((x: string) => DEFAULT_CONFIGS[x]) : visibleWidgets
            } catch { return visibleWidgets }
          })()
        const clamped = clampToBounds(rect, containerWidth)
        const blockers = readFreeformBoxes(prev, ids.filter((x) => x !== id))
          .map((b) => ({ x: b.x, y: b.y, width: b.width, height: b.height }))
        const settled = resolvePlacement(clamped, blockers, containerWidth)
        return { ...prev, [id]: { ...(prev[id] ?? DEFAULT_CONFIGS[id] ?? { cols: 1, rows: 1, column: 0, order: 0 }), ...settled } }
      })
    },
    [visibleWidgets],
  )

  /**
   * Reflow (add / remove / tidy): clamp every box into bounds and pack ALL
   * visible widgets upward and leftward. Run this on widget removal, re-add,
   * undo/redo of a removal, and the explicit "Tidy layout" button — never
   * during a drag gesture (drags commit via commitFreeformRect, which moves
   * only the dragged widget).
   *
   * Pass `visibleIds` from the caller when you have JUST called
   * setVisibleWidgets in the same tick: state and localStorage are stale
   * until the persist effect runs, so the hook cannot read the new list
   * itself. When omitted, the hook falls back to its own view.
   */
  const compactFreeformLayout = useCallback(
    (opts?: { containerWidth?: number; visibleIds?: string[] }) => {
      const { containerWidth = 1000, visibleIds } = opts ?? {}
      setWidgetConfigs((prev) => {
        if (typeof localStorage === 'undefined') return prev
        let ids = visibleIds ?? visibleWidgets
        if (visibleIds == null) {
          try {
            const saved = JSON.parse(localStorage.getItem('momentum-dashboard-widgets') ?? 'null')
            if (Array.isArray(saved)) ids = saved.filter((id: string) => DEFAULT_CONFIGS[id])
          } catch { /* ignore */ }
        }
        const boxes = readFreeformBoxes(prev, ids).map((b) =>
          ({ ...b, ...clampToBounds(b, containerWidth) }))
        if (boxes.length === 0) return prev
        return writeFreeformBoxes(prev, compactFreeform(boxes, containerWidth))
      })
    },
    [visibleWidgets],
  )

  return {
    visibleWidgets,
    setVisibleWidgets,
    widgetConfigs,
    setWidgetConfigs,
    setWidgetSize,
    reorderWidgets,
    moveWidgetToColumn,
    layoutMode,
    setLayoutMode: setLayoutModeWithSeed,
    commitFreeformRect,
    compactFreeformLayout,
  }
}