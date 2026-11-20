'use client'

import { usePathname } from 'next/navigation'
import { usePlayer } from '@/lib/player'

/** Thin now-playing strip pinned to the top once a track has started and you've left
 *  the home page (where the MusicCard itself is the control). × stops and hides it. */
export function MiniPlayer() {
  const pathname = usePathname()
  const { track, playing, progress, toggle, stop } = usePlayer()
  if (!track || pathname === '/') return null

  return (
    <div className="mini-player" role="region" aria-label="Now playing">
      <button
        type="button"
        className="mini-player__toggle"
        onClick={() => void toggle()}
        aria-label={playing ? `Pause ${track.title}` : `Play ${track.title}`}
      >
        <span className="mini-player__icon" aria-hidden>
          {playing ? <PauseIcon /> : <PlayIcon />}
        </span>
        <span className="mini-player__title">
          <strong>{track.title}</strong> · {track.artist}
        </span>
      </button>
      <button type="button" className="mini-player__close" onClick={stop} aria-label="Stop and close player">
        <CloseIcon />
      </button>
      <span className="mini-player__progress" style={{ transform: `scaleX(${progress})` }} aria-hidden />
    </div>
  )
}

const PlayIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10">
    <path d="M2 1l7 4-7 4z" fill="currentColor" />
  </svg>
)

const PauseIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10">
    <path d="M2 1h2v8H2zM6 1h2v8H6z" fill="currentColor" />
  </svg>
)

const CloseIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="3" strokeLinecap="square" />
  </svg>
)
