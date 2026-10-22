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
// NOTE: keep in sync with the runtime — the engine degrades gracefully when
// the API script is blocked (ad-blockers, offline), surfacing `failedAt` via
// loadYouTubeApi()'s rejection. See §10.66 in SPECIFICATIONS.md.

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
  setShuffle(shuffle: boolean): void
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
  width?: number
  height?: number
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
const STATE_UNSTARTED = -1

/** How long a play request may take to reach PLAYING before the UI shows
 *  "Can't play" (covers autoplay-block and silent unplayable-track cases). */
const STALL_TIMEOUT_MS = 8000

/** How long the queued play request waits for the API before giving up. */
const ENGINE_BOOT_TIMEOUT_MS = 15_000

/** Errors that mean "this video cannot be embedded/played" — skip it.
 *  2 = invalid param, 5 = HTML5 player error, 100 = removed/private,
 *  101/150 = embedding disabled by the owner. */
const SKIP_ERROR_CODES = [2, 5, 100, 101, 150]

// ── API loader (idempotent, one script tag for the app lifetime) ──

const MUSIC_LAST_PLAYLIST_KEY = 'momentum-last-playlist'
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
  setShuffle: (shuffle: boolean) => void
  /** Play the most recently used playlist, or the newest saved playlist. */
  playLastPlaylist: () => void
  /** Stop playback and forget the current playlist. */
  stop: () => void
  /** Re-attempt the active playlist after a stall or error stop. */
  retry: () => void
}

export interface MusicPlayerContextValue extends MusicPlayerActions {
  ready: boolean
  /** True when the YouTube IFrame API script failed to load (blocked). */
  engineFailed: boolean
  isPlaying: boolean
  /** True when a play request did not reach PLAYING (autoplay blocked etc.). */
  stalled: boolean
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
  shuffle: boolean
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
  const [engineFailed, setEngineFailed] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null)
  const [trackIndex, setTrackIndex] = useState(0)
  const [trackCount, setTrackCount] = useState<number | null>(null)
  const [trackTitle, setTrackTitle] = useState('')
  const [volume, setVolumeState] = useState<number>(() => loadSettings().musicVolume)
  const [skipping, setSkipping] = useState(false)
  // Set when a play request was issued but the player never reached PLAYING
  // (autoplay blocked, unplayable first track without an error event, etc.).
  // The dock/play buttons show "Can't play" instead of a dead '▶'.
  const [shuffle, setShuffleState] = useState(false)
  const [stalled, setStalled] = useState(false)

  const consecutiveErrors = useRef(0)
  const wantPlayRef = useRef(false)
  const pendingLoadRef = useRef<{ youtubePlaylistId: string; playlistId: string } | null>(null)
  const playLastRequestedRef = useRef(false)
  // Pause→resume nudge has been tried for the current play request. Reset on
  // every fresh play/cue so each request gets one recovery attempt.
  const nudgedRef = useRef(false)
  // Watchdog that clears `stalled` if PLAYING arrives late (buffering).
  const stallTimerRef = useRef<number | null>(null)

  const clearStallTimer = useCallback(() => {
    if (stallTimerRef.current !== null) {
      window.clearTimeout(stallTimerRef.current)
      stallTimerRef.current = null
    }
  }, [])

  /** Pause→resume recovery for a play request the browser silently refused
   *  (autoplay policy discards the queued playVideo() without any error
   *  event). Pausing and re-delivering playVideo() lets the policy grant
   *  playback once user intent is unambiguous. Runs once per play request;
   *  only when it also fails do we surface the "can't play" banner. */
  const tryNudge = useCallback((player: YTPlayer) => {
    if (nudgedRef.current || !wantPlayRef.current) return
    nudgedRef.current = true
    player.pauseVideo()
    window.setTimeout(() => {
      if (stallTimerRef.current === null && wantPlayRef.current) {
        player.playVideo()
        armStallTimerRef.current?.(player)
      }
    }, 400)
  }, [])

  // Late-bound so tryNudge can re-arm the watchdog without a dependency cycle.
  const armStallTimerRef = useRef<(player: YTPlayer) => void>(null as unknown as (player: YTPlayer) => void)

  const armStallTimer = useCallback((player: YTPlayer) => {
    clearStallTimer()
    stallTimerRef.current = window.setTimeout(() => {
      stallTimerRef.current = null
      // Only flag a stall if we still aren't playing (buffering resolves fast).
      const state = player.getPlayerState()
      if (state !== STATE_PLAYING) {
        // First stall: try the pause→resume nudge before giving up.
        if (!nudgedRef.current) {
          tryNudge(player)
          // Let the nudge's 400ms + re-armed watchdog judge success.
          return
        }
        // Nudge already tried and still stalled — now it's really blocked.
        setStalled(true)
        setIsPlaying(false)
        // Unplayable first track sometimes errors without hitting the skip
        // path (state stays UNSTARTED). Nudge to the next track, same as the
        // onError handler.
        consecutiveErrors.current += 1
        const count = player.getPlaylist?.()?.length ?? null
        if (consecutiveErrors.current >= (count ?? 100)) {
          wantPlayRef.current = false
          setSkipping(false)
          return
        }
        setSkipping(true)
        player.nextVideo()
        // Keep watching: the next track gets its own window to start.
        armStallTimer(player)
      }
    }, STALL_TIMEOUT_MS)
  }, [clearStallTimer, tryNudge])

  // Wire the late-bound reference once both callbacks exist.
  useEffect(() => {
    armStallTimerRef.current = armStallTimer
  }, [armStallTimer])

  // Load the stored volume into the player once it exists.
  useEffect(() => {
    if (engineReady && playerRef.current) playerRef.current.setVolume(volume)
  }, [engineReady, volume])

  // Clear the stall watchdog on unmount.
  useEffect(() => () => clearStallTimer(), [clearStallTimer])

  // Create the player once, on mount. Let the IFrame API create the iframe
  // from the container; passing a hand-created blank iframe prevents the API
  // from reliably attaching its command and state channel.
  useEffect(() => {
    let cancelled = false
    void loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !containerRef.current) return
        playerRef.current = new YT.Player(containerRef.current, {
          width: 180,
          height: 100,
          playerVars: {
            // Keep autoplay enabled on the embed so the browser grants the
            // iframe permission to honour a later user-initiated playVideo().
            // No playlist is loaded here, so creation remains silent.
            autoplay: 1,
            loop: 1,
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
                clearStallTimer()
                consecutiveErrors.current = 0
                setSkipping(false)
                setStalled(false)
                setIsPlaying(true)
                const index = event.target.getPlaylistIndex?.() ?? 0
                const count = event.target.getPlaylist?.()?.length ?? null
                setTrackIndex(index < 0 ? 0 : index)
                if (count !== null) setTrackCount(count)
                setTrackTitle(event.target.getVideoData?.()?.title ?? '')
              } else if (state === STATE_PAUSED) {
                // Do not cancel the watchdog while an explicit play request
                // is still pending; YouTube reports PAUSED during playlist
                // loading and the request may still transition to PLAYING.
                if (!wantPlayRef.current) {
                  clearStallTimer()
                  setStalled(false)
                }
                setIsPlaying(false)
              } else if (state === STATE_ENDED) {
                event.target.seekTo(0, true)
                event.target.playVideo()
                setIsPlaying(true)
              }
            },
            onError: (event) => {
              if (cancelled) return
              if (!SKIP_ERROR_CODES.includes(event.data)) return
              clearStallTimer()
              setStalled(false)
              consecutiveErrors.current += 1
              const count = event.target.getPlaylist?.()?.length ?? null
              const max = count ?? 100
              if (consecutiveErrors.current >= max) {
                wantPlayRef.current = false
                setSkipping(false)
                setIsPlaying(false)
                return
              }
              setSkipping(true)
              event.target.nextVideo()
              armStallTimer(event.target)
            },
          },
        })
      })
      .catch(() => {
        if (!cancelled) setEngineFailed(true)
      })
    return () => {
      cancelled = true
      clearStallTimer()
      playerRef.current?.destroy()
      playerRef.current = null
    }
  }, [clearStallTimer, armStallTimer])

  // Poll while playing so prev/next via the API (and track changes) update UI.
  useEffect(() => {
    if (!isPlaying) return
    const id = window.setInterval(() => {
      const player = playerRef.current
      if (!player) return
      const state = player.getPlayerState()
      if (state === STATE_PLAYING) {
        // Track changes while playing (next/prev/loop wrap) surface here.
        const count = player.getPlaylist?.()?.length ?? null
        if (count !== null) setTrackCount(count)
        setTrackTitle(player.getVideoData?.()?.title ?? '')
        setTrackIndex(player.getPlaylistIndex?.() ?? 0)
      } else if (state === STATE_PAUSED || state === STATE_UNSTARTED) {
        // The engine reports paused/unstarted without a browser gesture having
        // been delivered — the classic autoplay-block after pause+resume.
        // First pause/unstarted since the last play: try nudge and let watchdog
        // judge success before giving up. We skip this if a previous nudge is
        // already in flight (nudgedRef) or if we've given up (wantPlayRef=false).
        if (!nudgedRef.current && wantPlayRef.current) {
          tryNudge(player)
          // Let the next watchdog window evaluate after the nudge attempts recovery.
          return
        }
        // Subsequent PAUSED/UNSTARTED after nudge fail: now it's really blocked.
        // But if nudge is in flight (nudgedRef.current=true), let the watchdog
        // own the final verdict — the poll is racing the nudge's 400ms window.
        if (!nudgedRef.current) setStalled(true)
        setIsPlaying(false)
      }
    }, 1000)
    return () => window.clearInterval(id)
  }, [isPlaying, tryNudge])

  const playPlaylist = useCallback((playlistId: string) => {
    const row = playlists.find((p) => p.id === playlistId && !p.deletedAt)
    if (!row) return
    wantPlayRef.current = true
    setActivePlaylistId(playlistId)
    setTrackIndex(0)
    setTrackCount(row.trackCount ?? null)
    setTrackTitle('')
    consecutiveErrors.current = 0
    nudgedRef.current = false
    setSkipping(false)
    setStalled(false)
    const player = playerRef.current
    if (!player || !engineReady) {
      if (engineFailed) {
        wantPlayRef.current = false
        setActivePlaylistId(null)
        return
      }
      pendingLoadRef.current = { youtubePlaylistId: row.youtubePlaylistId, playlistId }
      window.setTimeout(() => {
        if (pendingLoadRef.current && !playerRef.current) {
          pendingLoadRef.current = null
          wantPlayRef.current = false
          setActivePlaylistId(null)
          setStalled(true)
        }
      }, ENGINE_BOOT_TIMEOUT_MS)
      return
    }
    clearStallTimer()
    window.localStorage.setItem(MUSIC_LAST_PLAYLIST_KEY, playlistId)
    player.loadPlaylist({ list: row.youtubePlaylistId, listType: 'playlist', index: 0 })
    player.setShuffle(shuffle)
    player.playVideo()
    armStallTimer(player)
  }, [playlists, engineReady, engineFailed, clearStallTimer, armStallTimer, shuffle])

  // Flush a play request that arrived before the engine was ready.
  useEffect(() => {
    const pending = pendingLoadRef.current
    if (!pending || !engineReady || !playerRef.current) return
    pendingLoadRef.current = null
    setActivePlaylistId(pending.playlistId)
    nudgedRef.current = false
    clearStallTimer()
    window.localStorage.setItem(MUSIC_LAST_PLAYLIST_KEY, pending.playlistId)
    playerRef.current.loadPlaylist({ list: pending.youtubePlaylistId, listType: 'playlist', index: 0 })
    playerRef.current.setShuffle(shuffle)
    playerRef.current.playVideo()
    armStallTimer(playerRef.current)
  }, [engineReady, clearStallTimer, armStallTimer, shuffle])
  const toggle = useCallback(() => {
    const player = playerRef.current
    if (!player || !activePlaylistId) return
    setStalled(false)
    if (wantPlayRef.current || player.getPlayerState() === STATE_PLAYING) {
      wantPlayRef.current = false
      clearStallTimer()
      player.pauseVideo()
      return
    }
    wantPlayRef.current = true
    nudgedRef.current = false
    clearStallTimer()
    player.playVideo()
    armStallTimer(player)
  }, [activePlaylistId, clearStallTimer, armStallTimer])

  const playLastPlaylist = useCallback(() => {
    const storedId = window.localStorage.getItem(MUSIC_LAST_PLAYLIST_KEY)
    const stored = storedId ? playlists.find((p) => p.id === storedId && !p.deletedAt) : null
    const newest = [...playlists].filter((p) => !p.deletedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
    const target = stored ?? newest
    if (target) {
      playPlaylist(target.id)
    } else {
      // DataProvider loads IndexedDB asynchronously. Keep the dashboard click
      // alive until playlists are available instead of requiring MusicPage.
      playLastRequestedRef.current = true
    }
  }, [playlists, playPlaylist])

  const setShuffle = useCallback((value: boolean) => {
    setShuffleState(value)
    playerRef.current?.setShuffle(value)
  }, [])

  useEffect(() => {
    if (!playLastRequestedRef.current || playlists.length === 0) return
    playLastRequestedRef.current = false
    playLastPlaylist()
  }, [playlists, playLastPlaylist])

  const next = useCallback(() => {
    consecutiveErrors.current = 0
    setStalled(false)
    clearStallTimer()
    const player = playerRef.current
    if (!player) return
    player.nextVideo()
    armStallTimer(player)
  }, [clearStallTimer, armStallTimer])

  const prev = useCallback(() => {
    consecutiveErrors.current = 0
    setStalled(false)
    clearStallTimer()
    const player = playerRef.current
    if (!player) return
    player.previousVideo()
    armStallTimer(player)
  }, [clearStallTimer, armStallTimer])

  const stop = useCallback(() => {
    wantPlayRef.current = false
    clearStallTimer()
    setStalled(false)
    setSkipping(false)
    playerRef.current?.stopVideo()
    setIsPlaying(false)
    setTrackTitle('')
    setActivePlaylistId(null)
    setTrackIndex(0)
    setTrackCount(null)
  }, [clearStallTimer])

  /** Retry the active playlist from its first track after a stall/failure. */
  const retry = useCallback(() => {
    if (!activePlaylistId) return
    playPlaylist(activePlaylistId)
  }, [activePlaylistId, playPlaylist])

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
      engineFailed,
      isPlaying,
      stalled,
      activePlaylistId,
      trackIndex,
      trackCount,
      trackTitle,
      volume,
      skipping,
      shuffle,
      playPlaylist,
      playLastPlaylist,
      toggle,
      next,
      prev,
      retry,
      setVolume,
      setShuffle,
      stop,
    }),
    [engineReady, engineFailed, isPlaying, stalled, activePlaylistId, trackIndex, trackCount, trackTitle, volume, skipping, shuffle, playPlaylist, playLastPlaylist, toggle, next, prev, retry, setVolume, setShuffle, stop],
  )

  return (
    <MusicPlayerContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-[-72px] right-0 z-0 h-[100px] w-[180px] overflow-hidden opacity-0" aria-hidden="true">
        <div ref={containerRef} />
      </div>
    </MusicPlayerContext.Provider>
  )
}