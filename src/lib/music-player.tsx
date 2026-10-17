// In-app music player: YouTube IFrame API engine + React context.
// The provider mounts once (inside DataProvider) and owns a single persistent
// player instance, so playback continues across route changes. All UI (dock,
// /music page) reads state and calls actions through useMusicPlayer().
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useData } from '../app/providers'
import { loadSettings, saveSettings } from './settings-store'

// ── Minimal YouTube IFrame API typings (only what we use) ──

export interface YTVideoData {
  video_id: string
  title: string
  author: string
}

export interface YTPlayer {
  playVideo(): void
  pauseVideo(): void
  stopVideo(): void
  nextVideo(): void
  previousVideo(): void
  loadPlaylist(options: { list: string; listType: 'playlist'; index?: number; startSeconds?: number }): void
  setVolume(volume: number): void
  getVolume(): number
  seekTo(seconds: number, allowSeekAhead: boolean): void
  getPlayerState(): number
  getPlaylist?(): string[] | null
  getPlaylistIndex?(): number
  getVideoData?(): YTVideoData | undefined
  destroy(): void
}

interface YTPlayerEvent {
  target: YTPlayer
  data: number
}

interface YTPlayerConfig {
  videoId?: string
  host?: string
  events?: {
    onReady?: (event: YTPlayerEvent) => void
    onStateChange?: (event: YTPlayerEvent) => void
    onError?: (event: YTPlayerEvent) => void
  }
  playerVars?: Record<string, string | number>
}

interface YTNamespace {
  Player: new (element: HTMLElement | string, config: YTPlayerConfig) => YTPlayer
  PlayerState: {
    UNSTARTED: number
    ENDED: number
    PLAYING: number
    PAUSED: number
    BUFFERING: number
    CUED: number
  }
}

declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

// YouTube player state codes we care about.
const STATE_ENDED = 0
const STATE_PLAYING = 1
const STATE_PAUSED = 2

/** Errors that mean "this video cannot be embedded/played" — skip it.
 *  2 = invalid param, 5 = HTML5 player error, 100 = removed/private,
 *  101/150 = embedding disabled by the owner. */
const SKIP_ERROR_CODES = [2, 5, 100, 101, 150]

// ── API loader (idempotent, one script tag for the app lifetime) ──

let ytApiPromise: Promise<YTNamespace> | null = null

function loadYouTubeApi(): Promise<YTNamespace> {
  if (ytApiPromise) return ytApiPromise
  const { promise, resolve, reject } = Promise.withResolvers<YTNamespace>()
  ytApiPromise = promise
  if (typeof document === 'undefined') {
    reject(new Error('No document'))
    return promise
  }
  if (window.YT?.Player) {
    resolve(window.YT)
    return promise
  }
  const previous = window.onYouTubeIframeAPIReady
  window.onYouTubeIframeAPIReady = () => {
    previous?.()
    if (window.YT) resolve(window.YT)
    else reject(new Error('YouTube API ready but YT namespace missing'))
  }
  const script = document.createElement('script')
  script.src = 'https://www.youtube.com/iframe_api'
  script.async = true
  script.onerror = () => reject(new Error('Failed to load the YouTube IFrame API'))
  document.head.appendChild(script)
  return promise
}

// ── Context shape ──

export interface MusicPlayerActions {
  /** Cue and play a playlist by MusicPlaylist.id. */
  playPlaylist: (playlistId: string) => void
  toggle: () => void
  next: () => void
  prev: () => void
  setVolume: (volume: number) => void
  /** Stop playback and forget the current playlist. */
  stop: () => void
}

export interface MusicPlayerContextValue extends MusicPlayerActions {
  ready: boolean
  isPlaying: boolean
  /** Active MusicPlaylist.id (null = nothing loaded). */
  activePlaylistId: string | null
  /** Index of the current track within the active playlist (0-based). */
  trackIndex: number
  /** Number of tracks in the active playlist, when known (null otherwise). */
  trackCount: number | null
  /** Current video title as reported by the player ('' when unknown). */
  trackTitle: string
  volume: number
  /** True while consecutive unplayable tracks are being skipped. */
  skipping: boolean
}

const MusicPlayerContext = createContext<MusicPlayerContextValue | null>(null)

export function useMusicPlayer(): MusicPlayerContextValue {
  const ctx = useContext(MusicPlayerContext)
  if (!ctx) throw new Error('useMusicPlayer must be used within MusicProvider')
  return ctx
}

// ── Provider ──

export function MusicProvider({ children }: { children: ReactNode }) {
  const { data } = useData()
  const playlists = data.musicPlaylists

  const playerRef = useRef<YTPlayer | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [engineReady, setEngineReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null)
  const [trackIndex, setTrackIndex] = useState(0)
  const [trackCount, setTrackCount] = useState<number | null>(null)
  const [trackTitle, setTrackTitle] = useState('')
  const [volume, setVolumeState] = useState<number>(() => loadSettings().musicVolume)
  const [skipping, setSkipping] = useState(false)

  const consecutiveErrors = useRef(0)
  const wantPlayRef = useRef(false)
  const pendingLoadRef = useRef<{ youtubePlaylistId: string; playlistId: string } | null>(null)

  // Load the stored volume into the player once it exists.
  useEffect(() => {
    if (engineReady && playerRef.current) playerRef.current.setVolume(volume)
  }, [engineReady, volume])

  // Create the player once, on mount.
  useEffect(() => {
    let cancelled = false
    void loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !containerRef.current) return
        playerRef.current = new YT.Player(containerRef.current, {
          playerVars: {
            autoplay: 0,
            loop: 1, // honored for playlists: wraps to the first track at the end
            controls: 0,
            disablekb: 1,
            playsinline: 1,
            rel: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              if (cancelled) return
              setEngineReady(true)
            },
            onStateChange: (event) => {
              if (cancelled) return
              const state = event.data
              if (state === STATE_PLAYING) {
                consecutiveErrors.current = 0
                setSkipping(false)
                setIsPlaying(true)
                const index = event.target.getPlaylistIndex?.() ?? 0
                const count = event.target.getPlaylist?.()?.length ?? null
                setTrackIndex(index < 0 ? 0 : index)
                if (count !== null) setTrackCount(count)
                setTrackTitle(event.target.getVideoData?.()?.title ?? '')
              } else if (state === STATE_PAUSED) {
                setIsPlaying(false)
              } else if (state === STATE_ENDED) {
                // Belt and braces: playerVars.loop covers playlists, but
                // explicitly restart so playback never stops.
                event.target.seekTo(0, true)
                event.target.playVideo()
                setIsPlaying(true)
              }
            },
            onError: (event) => {
              if (cancelled) return
              if (!SKIP_ERROR_CODES.includes(event.data)) return
              consecutiveErrors.current += 1
              const count = event.target.getPlaylist?.()?.length ?? null
              const max = count ?? 100
              if (consecutiveErrors.current >= max) {
                // Every track is unplayable — stop instead of spinning forever.
                wantPlayRef.current = false
                setSkipping(false)
                setIsPlaying(false)
                return
              }
              setSkipping(true)
              event.target.nextVideo()
            },
          },
        })
      })
      .catch(() => {
        // Network blocked or script error — the dock shows nothing active and
        // the /music page still manages playlists. Engine stays unready.
      })
    return () => {
      cancelled = true
      playerRef.current?.destroy()
      playerRef.current = null
    }
  }, [])

  // Poll while playing so prev/next via the API (and track changes) update UI.
  useEffect(() => {
    if (!isPlaying) return
    const id = window.setInterval(() => {
      const player = playerRef.current
      if (!player) return
      const index = player.getPlaylistIndex?.() ?? 0
      setTrackIndex(index < 0 ? 0 : index)
      const count = player.getPlaylist?.()?.length ?? null
      if (count !== null) setTrackCount(count)
      setTrackTitle(player.getVideoData?.()?.title ?? '')
    }, 1000)
    return () => window.clearInterval(id)
  }, [isPlaying])

  const playPlaylist = useCallback((playlistId: string) => {
    const row = playlists.find((p) => p.id === playlistId && !p.deletedAt)
    if (!row) return
    wantPlayRef.current = true
    setActivePlaylistId(playlistId)
    setTrackIndex(0)
    setTrackCount(row.trackCount ?? null)
    setTrackTitle('')
    consecutiveErrors.current = 0
    setSkipping(false)
    const player = playerRef.current
    if (!player || !engineReady) {
      // Engine still loading — remember the request; onReady continuation below.
      pendingLoadRef.current = { youtubePlaylistId: row.youtubePlaylistId, playlistId }
      return
    }
    player.loadPlaylist({ list: row.youtubePlaylistId, listType: 'playlist', index: 0 })
    player.playVideo()
  }, [playlists, engineReady])

  // Flush a play request that arrived before the engine was ready.
  useEffect(() => {
    const pending = pendingLoadRef.current
    if (!pending || !engineReady || !playerRef.current) return
    pendingLoadRef.current = null
    setActivePlaylistId(pending.playlistId)
    playerRef.current.loadPlaylist({ list: pending.youtubePlaylistId, listType: 'playlist', index: 0 })
    playerRef.current.playVideo()
  }, [engineReady])

  const toggle = useCallback(() => {
    const player = playerRef.current
    if (!player || !activePlaylistId) return
    const state = player.getPlayerState()
    if (state === STATE_PLAYING) {
      player.pauseVideo()
    } else {
      player.playVideo()
    }
  }, [activePlaylistId])

  const next = useCallback(() => {
    consecutiveErrors.current = 0
    playerRef.current?.nextVideo()
  }, [])

  const prev = useCallback(() => {
    consecutiveErrors.current = 0
    playerRef.current?.previousVideo()
  }, [])

  const stop = useCallback(() => {
    wantPlayRef.current = false
    playerRef.current?.stopVideo()
    setIsPlaying(false)
    setTrackTitle('')
    setActivePlaylistId(null)
    setTrackIndex(0)
    setTrackCount(null)
  }, [])

  const setVolume = useCallback((value: number) => {
    const clamped = Math.min(100, Math.max(0, Math.round(value)))
    setVolumeState(clamped)
    playerRef.current?.setVolume(clamped)
    // Persist, reading fresh settings so concurrent saves elsewhere are kept.
    try {
      const fresh = loadSettings()
      saveSettings({ ...fresh, musicVolume: clamped })
    } catch { /* localStorage unavailable */ }
  }, [])

  // If the active playlist is deleted while playing, keep playing — the user
  // explicitly started it. Refresh cached trackCount when the row is updated.
  const activeRow = useMemo(
    () => playlists.find((p) => p.id === activePlaylistId) ?? null,
    [playlists, activePlaylistId],
  )
  useEffect(() => {
    if (activeRow?.trackCount && activeRow.trackCount !== trackCount) {
      setTrackCount(activeRow.trackCount)
    }
  }, [activeRow?.trackCount])

  const value = useMemo<MusicPlayerContextValue>(
    () => ({
      ready: engineReady,
      isPlaying,
      activePlaylistId,
      trackIndex,
      trackCount,
      trackTitle,
      volume,
      skipping,
      playPlaylist,
      toggle,
      next,
      prev,
      setVolume,
      stop,
    }),
    [engineReady, isPlaying, activePlaylistId, trackIndex, trackCount, trackTitle, volume, skipping, playPlaylist, toggle, next, prev, setVolume, stop],
  )

  return (
    <MusicPlayerContext.Provider value={value}>
      {children}
      {/* Persistent player host. Positioned as a small visible player pinned
        * to the bottom-right so it stays embed-friendly and never intercepts
        * clicks (pointer-events-none); audio keeps playing across routes. */}
      <div className="pointer-events-none fixed bottom-0 right-0 z-0 h-px w-px overflow-hidden opacity-0" aria-hidden="true">
        <div ref={containerRef} />
      </div>
    </MusicPlayerContext.Provider>
  )
}
