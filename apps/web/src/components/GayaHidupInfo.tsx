'use client'

import { useEffect, useRef, useState } from 'react'
import { usePlayer } from '@/lib/player'
import { InfoIcon } from './InfoTip'

/**
 * The (i) next to "Gaya hidup" in the checkout totals. Opens a modal that plays the
 * Gaya Hidup clip (silent loop) together with the track. Native <dialog>: Esc, focus
 * trap and the top layer come for free.
 */
export function GayaHidupInfo() {
  const dialog = useRef<HTMLDialogElement>(null)
  const clip = useRef<HTMLVideoElement>(null)
  const audio = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const player = usePlayer()

  function play() {
    void audio.current?.play().catch(() => {})
    void clip.current?.play().catch(() => {})
  }

  function pause() {
    audio.current?.pause()
    clip.current?.pause()
  }

  function open() {
    player.pause() // the background track would play over the clip
    dialog.current?.showModal()
    play() // inside the click gesture, so autoplay with sound is allowed
  }

  // Runs on every close path: button, Esc, backdrop click.
  function onClose() {
    pause()
    if (audio.current) audio.current.currentTime = 0
    if (clip.current) clip.current.currentTime = 0
  }

  useEffect(() => () => pause(), [])

  return (
    <>
      <button type="button" className="info-btn" onClick={open} aria-label="What is Gaya hidup?">
        <InfoIcon />
      </button>
      <dialog
        ref={dialog}
        className="clip-modal"
        aria-label="Gaya Hidup by Basboi"
        onClose={onClose}
        // A click on the ::backdrop lands on the <dialog> element itself.
        onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
      >
        <button
          type="button"
          className="clip-modal__media"
          onClick={() => (playing ? pause() : play())}
          aria-label={playing ? 'Pause Gaya Hidup' : 'Play Gaya Hidup'}
        >
          <video
            ref={clip}
            src="/fx/gaya-hidup.mp4"
            poster="/fx/gaya-hidup.jpg"
            muted
            loop
            playsInline
            preload="none"
            aria-hidden
          />
          {!playing && (
            <span className="clip-modal__play" aria-hidden>
              ▶
            </span>
          )}
        </button>
        <div className="clip-modal__info">
          <strong>Gaya Hidup</strong>
          <span>Basboi</span>
          <p>Included with every order.</p>
        </div>
        <button type="button" className="clip-modal__close" onClick={() => dialog.current?.close()} aria-label="Close">
          <CloseIcon />
        </button>
        <audio
          ref={audio}
          src="/music/gaya-hidup.mp3"
          preload="none"
          loop
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        />
      </dialog>
    </>
  )
}

const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" />
  </svg>
)
