// Floating music dock — bottom-right persistent playback controls.
// Rendered once in AppLayout (next to FloatingTimerBanner); consumes
// useMusicPlayer() so playback state survives navigation.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { useMusicPlayer } from '../../lib/music-player'
import { useData } from '../../app/providers'

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
      <div className="fixed bottom-4 right-4 z-40">
        <Link
          to="/music"
          aria-label="Music player"
          title="Music player"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-lg border border-slate-200 text-lg hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-700"
        >
          🎵
        </Link>
      </div>
    )
  }

  const position = player.trackCount ? `${player.trackIndex + 1} / ${player.trackCount}` : `${player.trackIndex + 1}`

  return (
    <div
      className="fixed bottom-4 right-4 z-40 w-64 rounded-xl border border-slate-200 bg-white/95 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-800/95"
      aria-label="Music player controls"
    >
      <div className="flex items-center gap-1 border-b border-slate-200 px-3 py-2 dark:border-slate-700">
        <span aria-hidden className="text-base">🎵</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100" title={player.trackTitle || playlist.name}>
            {player.trackTitle || playlist.name}
          </p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            {playlist.name}{player.skipping ? ' · skipping unavailable tracks…' : ''} · {position}
          </p>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
          aria-label={expanded ? 'Hide volume' : 'Show volume'}
          aria-expanded={expanded}
        >
          {expanded ? '▾' : '▴'}
        </button>
      </div>
      <div className="flex items-center justify-center gap-1 px-3 py-2">
        <DockButton onClick={player.prev} label="Previous track">⏮</DockButton>
        <DockButton onClick={player.toggle} label={player.isPlaying ? 'Pause' : 'Play'} primary>
          {player.isPlaying ? '⏸' : '▶'}
        </DockButton>
        <DockButton onClick={player.next} label="Next track">⏭</DockButton>
        <Link
          to="/music"
          className="ml-1 rounded p-1.5 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
          aria-label="Manage playlists"
          title="Manage playlists"
        >
          ☰
        </Link>
      </div>
      <div className={cn('overflow-hidden transition-all', expanded ? 'max-h-16' : 'max-h-0')}>
        <div className="flex items-center gap-2 border-t border-slate-200 px-3 py-2 dark:border-slate-700">
          <span aria-hidden className="text-sm text-slate-500 dark:text-slate-400">🔊</span>
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
        'rounded-full p-2 text-sm leading-none transition-colors',
        primary
          ? 'bg-primary-600 text-white hover:bg-primary-700'
          : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
      )}
    >
      {children}
    </button>
  )
}