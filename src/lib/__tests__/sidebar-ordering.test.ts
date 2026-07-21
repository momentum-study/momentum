import { describe, it, expect } from 'vitest'

type NavItem = { to: string; label: string }
const BASE: NavItem[] = [
  { to: '/', label: 'Dashboard' },
  { to: '/subjects', label: 'Focus Areas' },
  { to: '/projects', label: 'Projects' },
  { to: '/calendar', label: 'Tasks' },
  { to: '/settings', label: 'Settings' },
]

function applyPrefs(base: NavItem[], prefs: { order: string[]; hidden: string[] }): NavItem[] {
  const hidden = new Set(prefs.hidden)
  const baseByTo = new Map(base.map(i => [i.to, i]))
  const knownTos = new Set(base.map(i => i.to))
  const ordered: NavItem[] = []
  const seen = new Set<string>()
  for (const to of prefs.order) {
    if (!knownTos.has(to) || seen.has(to)) continue
    const item = baseByTo.get(to)
    if (item) { ordered.push(item); seen.add(to) }
  }
  for (const item of base) {
    if (!seen.has(item.to)) ordered.push(item)
  }
  return ordered.filter(item => !hidden.has(item.to))
}

describe('applyPrefs', () => {
  it('returns base order when no prefs saved', () => {
    const result = applyPrefs(BASE, { order: [], hidden: [] })
    expect(result.map(i => i.to)).toEqual(['/', '/subjects', '/projects', '/calendar', '/settings'])
  })
  it('respects saved order', () => {
    const result = applyPrefs(BASE, { order: ['/settings', '/'], hidden: [] })
    expect(result.map(i => i.to)).toEqual(['/settings', '/', '/subjects', '/projects', '/calendar'])
  })
  it('hides hidden items', () => {
    const result = applyPrefs(BASE, { order: [], hidden: ['/calendar', '/settings'] })
    expect(result.map(i => i.to)).toEqual(['/', '/subjects', '/projects'])
  })
  it('backfills new items not in saved order', () => {
    const result = applyPrefs(BASE, { order: ['/'], hidden: [] })
    expect(result.map(i => i.to)).toEqual(['/', '/subjects', '/projects', '/calendar', '/settings'])
  })
  it('drops items no longer in base', () => {
    const result = applyPrefs(BASE, { order: ['/', '/nonexistent'], hidden: [] })
    expect(result.map(i => i.to)).not.toContain('/nonexistent')
  })
})
