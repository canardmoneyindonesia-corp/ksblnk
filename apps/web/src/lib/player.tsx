'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

/**
 * One <audio> element for the whole app, mounted in the root layout so a track keeps
 * playing across client-side navigation. MusicCard drives it on the home page; the
 * MiniPlayer bar shows it everywhere else.
 *
 * Full page loads (the DOKU payment redirect and the return to /checkout?order=…, or a
 * reload) would cut it off, so the track and position are saved to sessionStorage on
 * pagehide and picked up again on the next load. Browsers may refuse to autoplay sound
 * before the buyer interacts with the page; then it resumes on their first tap or key.
 */
export type Track = { src: string; title: string; artist: string }

type Player = {
  track: Track | null
  playing: boolean
  progress: number
  analyser: AnalyserNode | null
  toggle: (track?: Track) => Promise<void>
  pause: () => void
  stop: () => void
}

const PlayerContext = createContext<Player | null>(null)

const STORE_KEY = 'kskblnk:player'
type Saved = { track: Track; time: number; playing: boolean }

function readSaved(): Saved | null {
  try {
    const raw = sessionStorage.getItem(STORE_KEY)
    return raw ? (JSON.parse(raw) as Saved) : null
  } catch {
    return null
  }
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audio = useRef<HTMLAudioElement>(null)
  const ctx = useRef<AudioContext | null>(null)
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)
  const [track, setTrack] = useState<Track | null>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const pendingSeek = useRef<number | null>(null)

  // Web Audio for the visualiser, wired once on first play (browsers need a user gesture).
  function ensureAudioGraph() {
    if (ctx.current || !audio.current) return
    const ac = new AudioContext()
    const node = ac.createMediaElementSource(audio.current)
    const an = ac.createAnalyser()
    an.fftSize = 64
    node.connect(an)
    an.connect(ac.destination)
    ctx.current = ac
    setAnalyser(an)
  }

  const toggle = useCallback(
    async (next?: Track) => {
      const el = audio.current
      if (!el) return
      const switching = next && next.src !== track?.src
      if (switching) {
        el.src = next.src
        pendingSeek.current = null
        setTrack(next)
        setProgress(0)
      } else if (!el.paused) {
        el.pause()
        return
      }
      if (!el.src) return
      ensureAudioGraph()
      await ctx.current?.resume()
      await el.play().catch(() => {})
    },
    [track],
  )

  const pause = useCallback(() => audio.current?.pause(), [])

  const stop = useCallback(() => {
    const el = audio.current
    if (el) {
      el.pause()
      el.currentTime = 0
    }
    setTrack(null)
    setProgress(0)
  }, [])

  // Save on the way out of every full page load.
  const trackRef = useRef(track)
  trackRef.current = track
  useEffect(() => {
    const save = () => {
      const el = audio.current
      const t = trackRef.current
      try {
        if (!el || !t) sessionStorage.removeItem(STORE_KEY)
        else sessionStorage.setItem(STORE_KEY, JSON.stringify({ track: t, time: el.currentTime, playing: !el.paused }))
      } catch {}
    }
    window.addEventListener('pagehide', save)
    return () => window.removeEventListener('pagehide', save)
  }, [])

  // Pick it back up after a full page load.
  useEffect(() => {
    const saved = readSaved()
    const el = audio.current
    if (!saved || !el) return
    el.src = saved.track.src
    el.currentTime = saved.time // kept as the start position until the media loads
    pendingSeek.current = saved.time // …and re-applied on loadedmetadata where it isn't
    setTrack(saved.track)
    if (!saved.playing) return

    // Try right away without the Web Audio graph: a context made outside a user gesture
    // starts suspended and would mute the element. If the browser blocks autoplay, wait
    // for the first interaction. Either way, wire the visualiser on that interaction.
    let resumed = false
    void el.play().then(
      () => (resumed = true),
      () => {},
    )
    const onGesture = (e: Event) => {
      off()
      ensureAudioGraph()
      void ctx.current?.resume()
      // A tap on the bar / card button is handled by its own click (play or pause).
      if ((e.target as Element | null)?.closest?.('.mini-player, .music__media')) return
      if (!resumed && el.paused) void el.play().catch(() => {})
    }
    const events = ['pointerdown', 'keydown'] as const
    const off = () => events.forEach((e) => document.removeEventListener(e, onGesture, true))
    events.forEach((e) => document.addEventListener(e, onGesture, true))
    return off
  }, [])

  useEffect(() => () => void ctx.current?.close(), [])

  return (
    <PlayerContext.Provider value={{ track, playing, progress, analyser, toggle, pause, stop }}>
      {children}
      <audio
        ref={audio}
        preload="none"
        onPlay={() => setPlaying(true)}
        onLoadedMetadata={(e) => {
          const el = e.currentTarget
          if (pendingSeek.current != null && el.currentTime < 0.5) el.currentTime = pendingSeek.current
          pendingSeek.current = null
          if (el.duration) setProgress(el.currentTime / el.duration)
        }}
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
    </PlayerContext.Provider>
  )
}

export function usePlayer() {
  const p = useContext(PlayerContext)
  if (!p) throw new Error('usePlayer must be used inside <PlayerProvider>')
  return p
}
