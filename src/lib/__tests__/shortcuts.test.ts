import { describe, it, expect } from 'vitest'
import { eventToShortcutKey, SHORTCUTS } from '../shortcuts'

describe('eventToShortcutKey', () => {
  it('converts Cmd+K', () => {
    expect(eventToShortcutKey({ metaKey: true, key: 'k', ctrlKey: false, shiftKey: false, altKey: false } as KeyboardEvent)).toBe('Cmd+K')
  })
  it('converts Ctrl+Shift+T', () => {
    expect(eventToShortcutKey({ metaKey: false, key: 'T', ctrlKey: true, shiftKey: true, altKey: false } as KeyboardEvent)).toBe('Ctrl+Shift+T')
  })
  it('converts Escape', () => {
    expect(eventToShortcutKey({ metaKey: false, key: 'Escape', ctrlKey: false, shiftKey: false, altKey: false } as KeyboardEvent)).toBe('Esc')
  })
  it('converts Arrow keys', () => {
    expect(eventToShortcutKey({ metaKey: false, key: 'ArrowLeft', ctrlKey: false, shiftKey: false, altKey: false } as KeyboardEvent)).toBe('←')
  })
})

describe('SHORTCUTS', () => {
  it('includes all required global shortcuts', () => {
    const ids = SHORTCUTS.map(s => s.id)
    expect(ids).toContain('command-palette')
    expect(ids).toContain('undo')
    expect(ids).toContain('help')
    expect(ids).toContain('focus-mode')
    expect(ids).toContain('escape')
    expect(ids).toContain('nav-dashboard')
  })
  it('has no duplicate ids', () => {
    const ids = SHORTCUTS.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
