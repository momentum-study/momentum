// Playlist position persistence (§10.71).
// Stores the exact point a playlist is up to — track index plus elapsed
// seconds within that track — so replaying it resumes where it left off
// instead of restarting from the first track.
//
// The host player (music-player.tsx) drives persistence: it saves on track
// change, periodically while playing, and on page exit. loadPosition() /
// clearPosition() are exported for tests and other consumers.

const KEY_PREFIX = 'momentum-music-position:'

export interface MusicPosition {
  /** Zero-based track index within the playlist. */
  trackIndex: number
  /** Elapsed seconds into the current track. */
  trackSeconds: number
}

interface StoredPosition {
  /** Legacy field: track index only (pre-seconds format). */
  index?: number
  trackIndex?: number
  trackSeconds?: number
}

function keyFor(playlistId: string): string {
  return `${KEY_PREFIX}${playlistId}`
}

/** Read a playlist's stored position. Missing/corrupt data → start of the
 *  playlist (index 0, position 0), matching a fresh playlist. */
export function loadPosition(playlistId: string): MusicPosition {
  try {
    const raw = window.localStorage.getItem(keyFor(playlistId))
    if (!raw) return { trackIndex: 0, trackSeconds: 0 }
    const parsed = JSON.parse(raw) as StoredPosition
    const trackIndex = typeof parsed.trackIndex === 'number' ? parsed.trackIndex : parsed.index ?? 0
    const trackSeconds = typeof parsed.trackSeconds === 'number' ? parsed.trackSeconds : 0
    return {
      trackIndex: Number.isInteger(trackIndex) && trackIndex >= 0 ? trackIndex : 0,
      trackSeconds: trackSeconds >= 0 ? trackSeconds : 0,
    }
  } catch {
    return { trackIndex: 0, trackSeconds: 0 }
  }
}

/** Overwrite the stored position for a playlist. Broadcasts a
 *  `momentum:music-position-changed` event so UI can refresh live. */
export function savePosition(playlistId: string, position: MusicPosition): void {
  try {
    const payload: StoredPosition = {
      index: position.trackIndex,
      trackIndex: position.trackIndex,
      trackSeconds: position.trackSeconds,
    }
    window.localStorage.setItem(keyFor(playlistId), JSON.stringify(payload))
    window.dispatchEvent(new CustomEvent('momentum:music-position-changed', {
      detail: { playlistId, position } as Record<string, unknown>,
    }))
  } catch { /* localStorage unavailable */ }
}

/** Forget a playlist's stored position (e.g. after the playlist is deleted). */
export function clearPosition(playlistId: string): void {
  try {
    window.localStorage.removeItem(keyFor(playlistId))
    window.dispatchEvent(new CustomEvent('momentum:music-position-changed', {
      detail: { playlistId, cleared: true } as Record<string, unknown>,
    }))
  } catch { /* ignore */ }
}
