import { describe, it, expect } from 'vitest'
import {
  boxesOverlap, clampToBounds, resolvePlacement, compactFreeform, allBoxesValid,
  type FreeformBox,
} from '../freeform-layout'

const box = (id: string, x: number, y: number, width = 300, height = 200, order = 0): FreeformBox =>
  ({ id, x, y, width, height, order })

describe('boxesOverlap', () => {
  it('detects simple overlap', () => {
    expect(boxesOverlap({ x: 0, y: 0, width: 100, height: 100 }, { x: 50, y: 50, width: 100, height: 100 })).toBe(true)
  })
  it('ignores boxes separated by more than the gap', () => {
    // 100 + gap 8 = touching-up-to-108 is "overlap"; 110 is clear.
    expect(boxesOverlap({ x: 0, y: 0, width: 100, height: 100 }, { x: 110, y: 0, width: 100, height: 100 })).toBe(false)
  })
})

describe('clampToBounds', () => {
  it('floors size at freeform minimums', () => {
    const r = clampToBounds({ x: 0, y: 0, width: 50, height: 50 }, 1000)
    expect(r.width).toBeGreaterThanOrEqual(220)
    expect(r.height).toBeGreaterThanOrEqual(160)
  })
  it('clamps x so the box stays inside the container', () => {
    const r = clampToBounds({ x: 5000, y: 0, width: 300, height: 200 }, 1000)
    expect(r.x).toBe(1000 - 300)
    expect(r.y).toBe(0)
  })
  it('clamps negative y to zero', () => {
    expect(clampToBounds({ x: 0, y: -50, width: 300, height: 200 }, 1000).y).toBe(0)
  })
  it('caps width to the container when the container is narrower', () => {
    const r = clampToBounds({ x: 0, y: 0, width: 800, height: 200 }, 400)
    expect(r.width).toBe(400)
    expect(r.x).toBe(0)
  })
})

describe('resolvePlacement', () => {
  it('keeps a non-overlapping rect untouched', () => {
    const rect = { x: 0, y: 0, width: 300, height: 200 }
    const blocker = { x: 350, y: 0, width: 300, height: 200 }
    expect(resolvePlacement(rect, [blocker])).toEqual(rect)
  })
  it('pushes an overlapping rect to the nearest free edge', () => {
    const rect = { x: 10, y: 10, width: 300, height: 200 }
    const blocker = { x: 0, y: 0, width: 300, height: 200 }
    const settled = resolvePlacement(rect, [blocker])
    expect(allBoxesValid([settled, blocker])).toBe(true)
  })
  it('drops below everything when no clean slot exists', () => {
    // Wall of blockers spanning an entire band, repeatedly.
    const blockers = Array.from({ length: 6 }, (_, i) =>
      ({ x: 0, y: i * 210, width: 2000, height: 200 }))
    const settled = resolvePlacement({ x: 1000, y: 100, width: 300, height: 200 }, blockers)
    expect(allBoxesValid([settled, ...blockers])).toBe(true)
  })
})

describe('compactFreeform', () => {
  it('fills the hole left by a removed top-left widget by pulling others up/left', () => {
    // A removed at (0,0); B was below it, C below B. Both pack upward/leftward:
    // B takes the freed top-left slot, C packs beside it at the top row.
    const boxes = [box('b', 0, 208), box('c', 0, 416)]
    const packed = compactFreeform(boxes)
    const b = packed.find(p => p.id === 'b')!
    const c = packed.find(p => p.id === 'c')!
    expect(b.y).toBe(0)
    expect(b.x).toBe(0)
    expect(c.y).toBe(0)
    expect(c.x).toBeGreaterThan(0)
    expect(allBoxesValid(packed)).toBe(true)
  })
  it('stacks vertically when the container row is full', () => {
    // Box at the top row is wide; the next box cannot sit beside it and
    // Box at the top row is wide; with a 1000px container the next 300px box
    // cannot sit beside it (would overflow) and must cascade below.
    const wide = box('wide', 0, 0, 900, 200)
    const next = box('next', 0, 208, 300, 200, 1)
    const packed = compactFreeform([wide, next], 1000)
    const n = packed.find(p => p.id === 'next')!
    expect(n.y).toBe(208)
    expect(allBoxesValid(packed)).toBe(true)
  })
  it('is deterministic', () => {
    const boxes = [box('a', 120, 0), box('b', 0, 208, 300, 200, 1), box('c', 400, 208, 300, 200, 2)]
    const first = compactFreeform(boxes)
    const second = compactFreeform(boxes)
    expect(first).toEqual(second)
  })
  it('never produces overlaps or negative coordinates for a scattered layout', () => {
    const boxes = [
      box('a', 500, 900, 300, 400, 0),
      box('b', 0, 1200, 500, 300, 1),
      box('c', 800, 300, 220, 160, 2),
      box('d', 300, 600, 700, 200, 3),
      box('e', 0, 0, 240, 170, 4),
    ]
    const packed = compactFreeform(boxes)
    expect(allBoxesValid(packed)).toBe(true)
    for (const b of packed) {
      expect(b.x).toBeGreaterThanOrEqual(0)
      expect(b.y).toBeGreaterThanOrEqual(0)
    }
  })
  it('packs side by side when widths fit', () => {
    const boxes = [box('a', 0, 0), box('b', 308, 0)]
    const packed = compactFreeform(boxes)
    expect(packed.find(p => p.id === 'b')!.y).toBe(0)
  })
})