import { describe, it, expect } from 'vitest'
import { filterActive } from '../filterActive'

describe('filterActive', () => {
  it('filters out deleted items', () => {
    const items = [
      { id: 'a' },
      { id: 'b', deletedAt: '2026-07-01' },
      { id: 'c', deletedAt: null },
    ]
    expect(filterActive(items)).toEqual([{ id: 'a' }, { id: 'c', deletedAt: null }])
  })

  it('returns empty array for empty input', () => {
    expect(filterActive([])).toEqual([])
  })

  it('filters items with non-null deletedAt values', () => {
    const items = [
      { id: 'a', deletedAt: '2026-01-01' },
      { id: 'b', deletedAt: undefined },
      { id: 'c' },
      { id: 'd', deletedAt: '' },
    ]
    expect(filterActive(items)).toEqual([
      { id: 'b', deletedAt: undefined },
      { id: 'c' },
      { id: 'd', deletedAt: '' },
    ])
  })
})
