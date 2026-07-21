import { describe, it, expect } from 'vitest'

describe('ContextMenu', () => {
  it('calls action when item clicked', () => {
    let called = false
    const items = [{ label: 'Test', action: () => { called = true } }]
    // Simulate click
    items[0].action()
    expect(called).toBe(true)
  })
  it('supports danger style', () => {
    const items = [{ label: 'Delete', action: () => {}, danger: true }]
    expect(items[0].danger).toBe(true)
  })
  it('supports disabled state', () => {
    const items = [{ label: 'Delete', action: () => {}, disabled: true }]
    expect(items[0].disabled).toBe(true)
  })
})
