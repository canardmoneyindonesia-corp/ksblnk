'use client'

import { useEffect, useRef } from 'react'
import { usePlayer } from '@/lib/player'

/**
 * A grid tile the same size as a product card that plays one track.
 * Visual: a spinning CD with a progress ring and live frequency bars.
 * Playback lives in the app-wide PlayerProvider, so the track keeps going when you
 * leave the page (the MiniPlayer bar takes over the controls).
 */
export function MusicCard({
  src,
  title,
  artist,
  video,
  poster,
}: {
  src: string
  title: string
  artist: string
  /** Optional muted loop shown on the disc face; plays only while the track plays. */
  video?: string
  poster?: string
}) {
  const clip = useRef<HTMLVideoElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const player = usePlayer()
  const mine = player.track?.src === src
  const playing = mine && player.playing
  const progress = mine ? player.progress : 0
  const analyser = player.analyser

  function toggle() {
    void player.toggle({ src, title, artist })
  }

  // Frequency bars along the bottom of the tile.
  useEffect(() => {
    if (!playing) return
    let raf = 0
    const draw = () => {
      const c = canvas.current
      const an = analyser
      if (c && an) {
        const g = c.getContext('2d')!
        const w = (c.width = c.clientWidth * devicePixelRatio)
        const h = (c.height = c.clientHeight * devicePixelRatio)
        const data = new Uint8Array(an.frequencyBinCount)
        an.getByteFrequencyData(data)
        const n = 24
        const bw = w / n
        g.clearRect(0, 0, w, h)
        g.fillStyle = '#ffe300'
        for (let i = 0; i < n; i++) {
          const v = data[i]! / 255
          const bh = Math.max(2, v * h)
          g.fillRect(i * bw + bw * 0.2, h - bh, bw * 0.6, bh)
        }
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [playing, analyser])

  // Keep the disc video in step with the track.
  useEffect(() => {
    const v = clip.current
    if (!v) return
    if (playing) void v.play().catch(() => {})
    else v.pause()
  }, [playing])

  const R = 47
  const C = 2 * Math.PI * R

  return (
    <div className="music">
      <button
        type="button"
        className={`music__media${playing ? ' music__media--playing' : ''}`}
        onClick={toggle}
        aria-label={playing ? `Pause ${title}` : `Play ${title}`}
      >
        <div className="music__disc-wrap">
          <svg className="music__ring" viewBox="0 0 100 100" aria-hidden>
            <circle cx="50" cy="50" r={R} className="music__ring-track" />
            <circle
              cx="50"
              cy="50"
              r={R}
              className="music__ring-fill"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - progress)}
            />
          </svg>
          {video && (
            <video
              ref={clip}
              className="music__video"
              src={video}
              poster={poster}
              muted
              loop
              playsInline
              preload="none"
              aria-hidden
            />
          )}
          <div className={`music__disc${video ? ' music__disc--video' : ''}`} aria-hidden>
            <div className="music__label">
              <span>KSKBLNK</span>
              <span>RADIO</span>
            </div>
          </div>
        </div>
        <span className="music__btn" aria-hidden>
          {playing ? '❚❚' : '▶'}
        </span>
        <canvas ref={canvas} className="music__bars" aria-hidden />
      </button>
      <div className="card__info">
        <span className="card__name">{title}</span>
        <span className="card__price">{artist}</span>
      </div>
    </div>
  )
}
