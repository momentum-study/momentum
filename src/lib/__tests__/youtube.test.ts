import { describe, it, expect } from 'vitest'
import {
  extractPlaylistId,
  isPlausiblePlaylistId,
  isMixPlaylistId,
  extractPlaylistIdLoose,
} from '../youtube'

const PL = 'PLrAXtmErZgOeiKm4sgNOknGvNjby9evdf'
const PL_URL = `https://www.youtube.com/playlist?list=${PL}`
const WATCH_URL = `https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=${PL}`
const MUSIC_URL = `https://music.youtube.com/playlist?list=${PL}`
const YOUTU_BE = `https://youtu.be/dQw4w9WgXcQ?list=${PL}`

describe('extractPlaylistId', () => {
  it('extracts from a standard playlist URL', () => {
    expect(extractPlaylistId(PL_URL)).toBe(PL)
  })

  it('extracts from a watch URL with a list parameter', () => {
    expect(extractPlaylistId(WATCH_URL)).toBe(PL)
  })

  it('extracts from music.youtube.com URLs', () => {
    expect(extractPlaylistId(MUSIC_URL)).toBe(PL)
  })

  it('extracts from youtu.be short URLs', () => {
    expect(extractPlaylistId(YOUTU_BE)).toBe(PL)
  })

  it('accepts a bare playlist id', () => {
    expect(extractPlaylistId(PL)).toBe(PL)
  })

  it('accepts a URL without scheme', () => {
    expect(extractPlaylistId(`www.youtube.com/playlist?list=${PL}`)).toBe(PL)
  })

  it('returns the list param even when a video id is present', () => {
    expect(extractPlaylistId(`https://www.youtube.com/watch?v=abc&index=3&list=${PL}`)).toBe(PL)
  })

  it('rejects watch URLs without a list parameter', () => {
    expect(extractPlaylistId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull()
  })

  it('rejects empty and whitespace input', () => {
    expect(extractPlaylistId('')).toBeNull()
    expect(extractPlaylistId('   ')).toBeNull()
  })

  it('rejects arbitrary text', () => {
    expect(extractPlaylistId('not a url at all')).toBeNull()
  })

  it('rejects malformed URL-likes', () => {
    expect(extractPlaylistId('htp:///bad url')).toBeNull()
  })
})

describe('isPlausiblePlaylistId', () => {
  it('accepts typical ids', () => {
    expect(isPlausiblePlaylistId(PL)).toBe(true)
    expect(isPlausiblePlaylistId('OLAK5uy_kApLdCgO7z7L8XbCz')).toBe(true)
    expect(isPlausiblePlaylistId('RDMM'.padEnd(20, 'x'))).toBe(true)
  })

  it('rejects short strings', () => {
    expect(isPlausiblePlaylistId('PLabc')).toBe(false)
  })

  it('rejects ids with URL-unsafe characters', () => {
    expect(isPlausiblePlaylistId('PLabc/../../etc')).toBe(false)
    expect(isPlausiblePlaylistId('PL abc def gh')).toBe(false)
  })
})

describe('isMixPlaylistId', () => {
  it('flags RD-prefixed mix ids', () => {
    expect(isMixPlaylistId('RDMM')).toBe(true)
    expect(isMixPlaylistId(`RD${PL.slice(2)}`)).toBe(true)
    expect(isMixPlaylistId(PL)).toBe(false)
  })
})

describe('extractPlaylistIdLoose', () => {
  it('finds a list id inside surrounding text', () => {
    expect(
      extractPlaylistIdLoose(`pumping tunes ${PL_URL} enjoy`)
    ).toBe(PL)
  })

  it('falls back to exact parsing when there is no list= param', () => {
    expect(extractPlaylistIdLoose(PL)).toBe(PL)
    expect(extractPlaylistIdLoose('hello world')).toBeNull()
  })
})