import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearPosition, loadPosition, savePosition } from '../music-position'

describe('music playlist position persistence', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('round-trips track index and within-track seconds', () => {
    savePosition('playlist-1', { trackIndex: 4, trackSeconds: 137 })

    expect(loadPosition('playlist-1')).toEqual({ trackIndex: 4, trackSeconds: 137 })
  })

  it('reads legacy track-index-only entries at the saved track', () => {
    localStorage.setItem('momentum-music-position:playlist-1', JSON.stringify({ index: 3 }))

    expect(loadPosition('playlist-1')).toEqual({ trackIndex: 3, trackSeconds: 0 })
  })

  it('falls back safely for missing and invalid entries', () => {
    expect(loadPosition('missing')).toEqual({ trackIndex: 0, trackSeconds: 0 })

    localStorage.setItem('momentum-music-position:playlist-1', '{bad json')
    expect(loadPosition('playlist-1')).toEqual({ trackIndex: 0, trackSeconds: 0 })

    localStorage.setItem('momentum-music-position:playlist-2', JSON.stringify({ trackIndex: -1, trackSeconds: -4 }))
    expect(loadPosition('playlist-2')).toEqual({ trackIndex: 0, trackSeconds: 0 })
  })

  it('clears one playlist without affecting another', () => {
    savePosition('playlist-1', { trackIndex: 2, trackSeconds: 20 })
    savePosition('playlist-2', { trackIndex: 5, trackSeconds: 40 })

    clearPosition('playlist-1')

    expect(loadPosition('playlist-1')).toEqual({ trackIndex: 0, trackSeconds: 0 })
    expect(loadPosition('playlist-2')).toEqual({ trackIndex: 5, trackSeconds: 40 })
  })
})
