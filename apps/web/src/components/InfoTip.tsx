'use client'

import { useEffect, useId, useRef, useState } from 'react'

/** An (i) button that toggles a short text bubble. Closes on outside tap or Esc. */
export function InfoTip({ text, label }: { text: string; label: string }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLSpanElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <span ref={root} className="info-tip">
      <button
        type="button"
        className="info-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
      >
        <InfoIcon />
      </button>
      {open && (
        <span id={id} role="status" className="info-tip__bubble">
          {text}
        </span>
      )}
    </span>
  )
}

export const InfoIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M12 11v6" stroke="currentColor" strokeWidth="2.5" />
    <circle cx="12" cy="7.5" r="1.4" fill="currentColor" />
  </svg>
)
