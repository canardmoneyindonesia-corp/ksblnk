'use client'

import { useEffect, useRef } from 'react'

/**
 * Animated KASABLANKA logo: the DXV master (1280×640, 12 fps, opaque yellow card)
 * re-encoded to a 720×360 H.264 loop in public/fx, shown full-width as the topbar. Plays muted inline so iOS allows it;
 * reduced-motion viewers and refused autoplay (Low Power Mode) keep the poster frame.
 */
export function LogoMark() {
  const video = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const v = video.current
    if (!v || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    v.play().catch(() => {})
  }, [])

  return (
    <video
      ref={video}
      className="logo__video"
      src="/fx/kasablanka-logo.mp4"
      poster="/fx/kasablanka-logo.jpg"
      width={720}
      height={360}
      muted
      loop
      playsInline
      preload="auto"
      aria-hidden="true"
    />
  )
}
