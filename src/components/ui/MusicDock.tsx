// Floating music dock — bottom-right persistent playback controls.
// Rendered once in AppLayout (next to FloatingTimerBanner); consumes
// useMusicPlayer() so playback state survives navigation.
// Icons are inline SVGs per UI convention (spec §10.65: no emoji affordances).
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { useMusicPlayer } from '../../lib/music-player'
import { useData } from '../../app/providers'

/* ----- Icons (stroke-based, matching the app's SVG icon language) ----- */

function MusicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 18V5l12-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zM21 16a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function PrevIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 5h2v14H6zM20 5v14L9 12z" />
    </svg>
  )
}

function NextIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M16 5h2v14h-2zM4 5v14l11-7z" />
    </svg>
  )
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function PauseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
    </svg>
  )
}

function ListIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h10M4 17h13" />
    </svg>
  )
}

function VolumeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5L6 9H3v6h3l5 4V5zM15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13" />
    </svg>
  )
}

function ChevronIcon({ className, up }: { className?: string; up?: boolean }) {
  return (
    <svg className={cn(className, up && 'rotate-180')} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}

/* ----- Dock ----- */

export function MusicDock() {
  const player = useMusicPlayer()
  const { data } = useData()
  const [expanded, setExpanded] = useState(false)

  const playlist = player.activePlaylistId
    ? data.musicPlaylists.find((p) => p.id === player.activePlaylistId) ?? null
    : null

  // Nothing cued: show a compact link to the Music page only.
  if (!playlist) {
    return (
      <div className="fixed bottom-24 right-4 z-40">
        <Link
          to="/music"
          aria-label="Music player"
          title="Music player"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-lg hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          <MusicIcon className="h-5 w-5" />
        </Link>
      </div>
    )
  }

  const position = player.trackCount ? `${player.trackIndex + 1} / ${player.trackCount}` : `${player.trackIndex + 1}`
  const blocked = player.stalled || player.engineFailed

  return (
    <div
      className="fixed bottom-24 right-4 z-40 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white/95 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-800/95"
      aria-label="Music player controls"
    >
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-700">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300">
          <MusicIcon className={cn('h-4 w-4', player.isPlaying && 'animate-pulse')} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100" title={player.trackTitle || playlist.name}>
            {player.trackTitle || playlist.name}
          </p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            {playlist.name}
            {player.skipping ? ' · skipping unavailable tracks…' : blocked ? ' · can’t play — check connection' : ''} · {position}
          </p>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
          aria-label={expanded ? 'Hide volume' : 'Show volume'}
          aria-expanded={expanded}
        >
          <ChevronIcon className="h-4 w-4" up={!expanded} />
        </button>
      </div>
      <div className="flex items-center justify-center gap-1 px-3 py-2">
        <DockButton onClick={player.prev} label="Previous track">
          <PrevIcon className="h-4 w-4" />
        </DockButton>
        <DockButton onClick={player.toggle} label={blocked ? "Can't play" : player.isPlaying ? 'Pause' : 'Play'} primary>
          <PlayPauseGlyph isPlaying={player.isPlaying} stalled={blocked} />
        </DockButton>
        <DockButton onClick={player.next} label="Next track">
          <NextIcon className="h-4 w-4" />
        </DockButton>
        <Link
          to="/music"
          className="ml-1 rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
          aria-label="Manage playlists"
          title="Manage playlists"
        >
          <ListIcon className="h-4 w-4" />
        </Link>
      </div>
      {blocked && (
        <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-amber-50 px-3 py-1.5 dark:border-slate-700 dark:bg-amber-900/30">
          <p className="text-xs text-amber-700 dark:text-amber-300">
            {player.engineFailed ? 'Music engine blocked or offline' : 'Playback was blocked by your browser'}
          </p>
          <button
            onClick={player.retry}
            className="shrink-0 rounded-md bg-amber-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-amber-700"
          >
            Retry
          </button>
        </div>
      )}
      <div className={cn('overflow-hidden transition-all', expanded ? 'max-h-16' : 'max-h-0')}>
        <div className="flex items-center gap-2 border-t border-slate-200 px-3 py-2 dark:border-slate-700">
          <VolumeIcon className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={player.volume}
            onChange={(e) => player.setVolume(Number(e.target.value))}
            className="h-1.5 flex-1 accent-primary-600"
            aria-label="Volume"
          />
          <span className="w-8 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">{player.volume}</span>
        </div>
      </div>
    </div>
  )
}

/** Primary dock action glyph: play / paused / stalled, per playback state. */
function PlayPauseGlyph({ isPlaying, stalled }: { isPlaying: boolean; stalled: boolean }) {
  if (stalled) return <PauseIcon className="h-4 w-4" />
  return isPlaying ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />
}

function DockButton({ onClick, label, primary, children }: {
  onClick: () => void
  label: string
  primary?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'rounded-full p-2 transition-colors',
        primary
          ? 'bg-primary-600 text-white hover:bg-primary-700'
          : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700',
      )}
    >
      {children}
    </button>
  )
}