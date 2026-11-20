'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * A grid tile the same size as a product card that plays one track.
 * Visual: a spinning CD with a progress ring and live frequency bars.
 * v1: one hardcoded track; no CMS wiring yet.
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
  const audio = useRef<HTMLAudioElement>(null)
  const clip = useRef<HTMLVideoElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const analyser = useRef<AnalyserNode | null>(null)
  const ctx = useRef<AudioContext | null>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)

  // Wire up Web Audio once, on first play (browsers need a user gesture).
  function ensureAudioGraph() {
    if (ctx.current || !audio.current) return
    const ac = new AudioContext()
    const node = ac.createMediaElementSource(audio.current)
    const an = ac.createAnalyser()
    an.fftSize = 64
    node.connect(an)
    an.connect(ac.destination)
    ctx.current = ac
    analyser.current = an
  }

  async function toggle() {
    const el = audio.current
    if (!el) return
    if (el.paused) {
      ensureAudioGraph()
      await ctx.current?.resume()
      await el.play()
    } else {
      el.pause()
    }
  }

  // Frequency bars along the bottom of the tile.
  useEffect(() => {
    if (!playing) return
    let raf = 0
    const draw = () => {
      const c = canvas.current
      const an = analyser.current
      if (c && an) {
        const g = c.getContext('2d')!
        const w = (c.width = c.clientWidth * devicePixelRatio)
        const h = (c.height = c.clientHeight * devicePixelRatio)
        const data = new Uint8Array(an.frequencyBinCount)
        an.getByteFrequencyData(data)
        const n = 24
        const bw = w / n
        g.clearRect(0, 0, w, h)
        g.fillStyle = '#d8ff3c'
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
  }, [playing])

  // Keep the disc video in step with the track.
  useEffect(() => {
    const v = clip.current
    if (!v) return
    if (playing) void v.play().catch(() => {})
    else v.pause()
  }, [playing])

  useEffect(() => () => void ctx.current?.close(), [])

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
        <span className="music__tag">Now playing</span>
      </button>
      <div className="card__info">
        <span className="card__name">{title}</span>
        <span className="card__price">{artist}</span>
      </div>
      <audio
        ref={audio}
        src={src}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false)
          setProgress(0)
        }}
        onTimeUpdate={(e) => {
          const el = e.currentTarget
          if (el.duration) setProgress(el.currentTime / el.duration)
        }}
      />
    </div>
  )
}
