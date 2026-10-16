/**
 * Freeform dashboard layout engine — pure functions, no React.
 *
 * Fresh design replacing the algorithm removed in 72e50ec (which teleported
 * widgets because it re-ran a global cascade on every gesture). The invariant
 * here is maintained by construction:
 *
 *   1. No two visible widget boxes ever overlap.
 *   2. Every box is inside the container horizontally (x >= 0, x + width <=
 *      containerWidth when possible) and vertically (y >= 0).
 *
 * All mutations of widget boxes (drop, resize, restore, removal cascade) go
 * through these functions, so the invariant holds after every operation and
 * is cheap to unit test. Widgets other than the one being moved are NEVER
 * repositioned by a drag or resize — only `compactFreeform` (removal, add,
 * explicit tidy) reflows, and it only ever moves widgets UP and LEFT into
 * freed space.
 */

export const FREEFORM_GAP = 8
export const FREEFORM_MIN_W = 220
export const FREEFORM_MIN_H = 160

export interface FreeformRect {
  x: number
  y: number
  width: number
  height: number
}

export interface FreeformBox extends FreeformRect {
  id: string
  order: number
}

/** Axis-aligned overlap test with the freeform gap breathing room. */
export function boxesOverlap(a: FreeformRect, b: FreeformRect): boolean {
  return (
    a.x < b.x + b.width + FREEFORM_GAP &&
    a.x + a.width + FREEFORM_GAP > b.x &&
    a.y < b.y + b.height + FREEFORM_GAP &&
    a.y + a.height + FREEFORM_GAP > b.y
  )
}

function clampSize(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, Math.round(n)))
}

/**
 * Clip a rect into bounds: width/height floored at the freeform minimums and
 * width capped to the container (so a widget narrower than its container is
 * never clipped horizontally); x clamped to [0, containerWidth - width];
 * y clamped to [0, ∞). Guarantees the "out-of-bounds clipping" requirement.
 */
export function clampToBounds(box: FreeformRect, containerWidth: number): FreeformRect {
  const width = clampSize(box.width, FREEFORM_MIN_W, Math.max(FREEFORM_MIN_W, Math.round(containerWidth)))
  const height = clampSize(box.height, FREEFORM_MIN_H, 4000)
  const maxX = Math.max(0, Math.round(containerWidth) - width)
  return {
    width,
    height,
    x: Math.max(0, Math.min(maxX, Math.round(Number.isFinite(box.x) ? box.x : 0))),
    y: Math.max(0, Math.round(Number.isFinite(box.y) ? box.y : 0)),
  }
}

/**
 * Resolve a moved/resized/restored rect against fixed blockers: try the
 * candidate positions nearest the original (blocker edges in both axes,
 * plus corner slots) and take the first that does not overlap anything.
 * Falls back to dropping the box below everything. Blockers are never moved.
 *
 * Candidates that would stick out past `containerWidth` are rejected, so the
 * committed rect always agrees with the render-time clamp.
 */
export function resolvePlacement(
  moved: FreeformRect,
  blockers: FreeformRect[],
  containerWidth?: number,
): FreeformRect {
  if (!blockers.some((b) => boxesOverlap(moved, b))) return moved

  const candidates: FreeformRect[] = []
  for (const b of blockers) {
    candidates.push({ ...moved, x: b.x + b.width + FREEFORM_GAP })
    candidates.push({ ...moved, x: b.x - moved.width - FREEFORM_GAP })
    candidates.push({ ...moved, y: b.y + b.height + FREEFORM_GAP })
    candidates.push({ ...moved, y: b.y - moved.height - FREEFORM_GAP })
    // Corner slots: pin to one blocker's right edge and another's bottom edge.
    for (const b2 of blockers) {
      candidates.push({ ...moved, x: b.x + b.width + FREEFORM_GAP, y: b2.y + b2.height + FREEFORM_GAP })
      candidates.push({ ...moved, x: b.x + b.width + FREEFORM_GAP, y: b2.y - moved.height - FREEFORM_GAP })
    }
  }

  const fits = (c: FreeformRect) =>
    c.x >= 0 && c.y >= 0 &&
    (containerWidth == null || c.x + c.width <= Math.round(containerWidth))

  let best: { rect: FreeformRect; dist: number } | null = null
  for (const c of candidates) {
    if (!fits(c)) continue
    if (blockers.some((b) => boxesOverlap(c, b))) continue
    const dist = Math.hypot(c.x - moved.x, c.y - moved.y)
    if (best == null || dist < best.dist) best = { rect: c, dist }
  }
  if (best) return best.rect

  // No free slot anywhere inside the bounds — clamp below everything.
  const maxBottom = blockers.reduce((m, b) => Math.max(m, b.y + b.height + FREEFORM_GAP), 0)
  if (containerWidth == null) return { ...moved, x: 0, y: maxBottom }
  return clampToBounds({ ...moved, x: 0, y: maxBottom }, containerWidth)
}

/**
 * Cascade pass: every box packs upward and leftward into freed space.
 *
 * - Processes boxes top-to-bottom (then left-right, then given order) so the
 *   uppermost gaps are filled first ("top-of-column cascade").
 * - Deterministic: the same input always yields the same packing.
 * - O(n² · candidates) worst case — fine for a dashboard-sized n (~10).
 */
export function compactFreeform(boxes: FreeformBox[], containerWidth?: number): FreeformBox[] {
  const sorted = [...boxes].sort((a, b) => a.y - b.y || a.x - b.x || a.order - b.order)
  const placed: FreeformBox[] = []
  // A candidate position is only feasible when it keeps the box fully inside
  // the container horizontally (when a width is known) and on-canvas.
  const fits = (x: number, w: number) =>
    x >= 0 && (containerWidth == null || x + w <= Math.round(containerWidth))
  for (const box of sorted) {
    const candidates: Array<{ x: number; y: number }> = [{ x: 0, y: 0 }]
    for (const b of placed) {
      candidates.push({ x: 0, y: b.y + b.height + FREEFORM_GAP }) // below a placed box
      candidates.push({ x: b.x + b.width + FREEFORM_GAP, y: box.y }) // right of a placed box, at own height
      candidates.push({ x: b.x + b.width + FREEFORM_GAP, y: 0 }) // and at the top row
      candidates.push({ x: b.x - box.width - FREEFORM_GAP, y: box.y })
      candidates.push({ x: b.x - box.width - FREEFORM_GAP, y: 0 })
    }
    // Also below candidates at other boxes' y, so side-by-side packing fills
    // horizontal gaps without floating in space.
    for (const b of placed) {
      candidates.push({ x: box.x, y: b.y + b.height + FREEFORM_GAP })
      candidates.push({ x: b.x + b.width + FREEFORM_GAP, y: b.y + b.height + FREEFORM_GAP })
    }
    candidates.sort((c1, c2) => c1.y - c2.y || c1.x - c2.x)
    let settled: FreeformBox | null = null
    for (const c of candidates) {
      if (!fits(c.x, box.width) || c.y < 0) continue
      const test = { ...box, x: c.x, y: c.y }
      if (!placed.some((b) => boxesOverlap(test, b))) {
        settled = test
        break
      }
    }
    if (!settled) {
      const maxBottom = placed.reduce((m, b) => Math.max(m, b.y + b.height + FREEFORM_GAP), 0)
      settled = { ...box, x: 0, y: maxBottom }
    }
    placed.push(settled)
  }
  // Return in input order (mapped to settled positions) so callers can diff
  // against their configs by id.
  const byId = new Map(placed.map((b) => [b.id, b]))
  return boxes.map((b) => byId.get(b.id) ?? b)
}

/** True when no two boxes overlap. Used by tests and cheap dev assertions. */
export function allBoxesValid(boxes: FreeformRect[]): boolean {
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (boxesOverlap(boxes[i], boxes[j])) return false
    }
  }
  return true
}