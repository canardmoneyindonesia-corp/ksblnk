'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Full-screen money-rain overlay shown once when an order is paid.
 *
 * The clip is an opaque H.264 MP4 rendered on white and composited with
 * `mix-blend-mode: multiply`: white drops out against the light page, so it
 * reads as transparent in every browser (incl. iOS Safari, which can't play
 * alpha WebM). Plays once per order, never for reduced-motion users, and
 * never blocks clicks.
 */
export function MoneyRain({ orderId }: { orderId: string }) {
  const [show, setShow] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const key = `kskblnk:rain:${orderId}`

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    try {
      if (localStorage.getItem(key)) return
      localStorage.setItem(key, '1')
    } catch {
      // storage blocked: still celebrate, it just may replay on refresh
    }
    setShow(true)
  }, [key])

  useEffect(() => {
    if (!show || !video.current) return
    // Autoplay can be refused (e.g. iOS Low Power Mode); then just skip it.
    video.current.play().catch(() => setShow(false))
  }, [show])

  if (!show) return null
  return (
    <div className="money-rain" aria-hidden="true">
      <video
        ref={video}
        src="/fx/money-rain.mp4"
        muted
        playsInline
        autoPlay
        preload="auto"
        onEnded={() => setShow(false)}
        onError={() => setShow(false)}
      />
    </div>
  )
}
