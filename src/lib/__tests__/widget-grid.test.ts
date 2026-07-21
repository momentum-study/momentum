import { describe, it, expect } from 'vitest'

describe('Widget Grid', () => {
  it('reorders items correctly', () => {
    const items = ['a', 'b', 'c', 'd']
    function reorder(fromId: string, toId: string) {
      const result = [...items]
      const fromIndex = result.indexOf(fromId)
      const toIndex = result.indexOf(toId)
      if (fromIndex === -1 || toIndex === -1) return
      result.splice(fromIndex, 1)
      result.splice(toIndex, 0, fromId)
      return result
    }
    const result = reorder('d', 'a')
    expect(result).toEqual(['d', 'a', 'b', 'c'])
  })
  it('cycles sizes correctly', () => {
    const sizes = ['small', 'medium', 'large'] as const
    function toggle(current: (typeof sizes)[number]) {
      return current === 'small' ? 'medium' : current === 'medium' ? 'large' : 'small'
    }
    expect(toggle('small')).toBe('medium')
    expect(toggle('medium')).toBe('large')
    expect(toggle('large')).toBe('small')
  })
})
