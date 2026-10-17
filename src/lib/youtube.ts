// YouTube URL / playlist-id parsing for the in-app music player.
// Pure functions — no network, no DOM — so they are trivially testable.

/**
 * Extract the bare YouTube playlist id from any pasted input.
 * Accepts:
 *   - full URLs:  https://www.youtube.com/playlist?list=PLxxxxx
 *   - watch URLs: https://www.youtube.com/watch?v=abc&list=PLxxxxx
 *   - short URLs: https://youtu.be/abc?list=PLxxxxx
 *   - music.youtube.com variants of the above
 *   - bare playlist ids (PL..., OL, RD, LL, FL, WL, UU prefixes etc.)
 * Returns null when the input does not contain a recognisable YouTube
 * playlist id.
 */
export function extractPlaylistId(input: string): string | null {
  const value = input.trim()
  if (!value) return null

  // A URL — read the `list` query parameter.
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('//')) {
    try {
      const url = new URL(value.startsWith('//') ? `https:${value}` : value)
      const list = url.searchParams.get('list')
      if (list && isPlausiblePlaylistId(list)) return list
      return null
    } catch {
      return null
    }
  }

  // Tolerate a missing scheme (youtube.com/playlist?list=...).
  if (/^(?:www\.|music\.)?(?:youtube\.com|youtu\.be)\//i.test(value)) {
    const qIndex = value.indexOf('?')
    if (qIndex !== -1) {
      try {
        const url = new URL(`https://${value}`)
        const list = url.searchParams.get('list')
        if (list && isPlausiblePlaylistId(list)) return list
      } catch { /* fall through */ }
    }
    return null
  }

  // Bare id.
  if (isPlausiblePlaylistId(value)) return value
  return null
}

/** Playlist ids are 12-48 chars of URL-safe characters. Video "watch-later"
 *  and "liked videos" pseudo-lists are excluded: they require auth and the
 *  IFrame embed cannot play them. */
export function isPlausiblePlaylistId(id: string): boolean {
  return /^[\w-]{12,48}$/.test(id)
}

/** True for the pseudo-playlists YouTube uses for queues (Mix radios etc.)
 *  which work in the IFrame player but have no stable contents. */
export function isMixPlaylistId(id: string): boolean {
  return id.startsWith('RD')
}

/**
 * Pull the `list` id out of a paste that may contain extra text, e.g.
 *   "listen to this https://youtube.com/playlist?list=PLabc while studying"
 */
export function extractPlaylistIdLoose(text: string): string | null {
  const match = text.match(/[?&]list=([\w-]{12,48})/)
  return match ? match[1] : extractPlaylistId(text)
}