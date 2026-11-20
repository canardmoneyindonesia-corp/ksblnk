'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

/**
 * Goes back in history when the visitor arrived from inside the shop (keeps scroll
 * position on the grid); otherwise — shared link, new tab — falls through to the home link.
 */
export function useBackClick() {
  const router = useRouter()

  return function onClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    let sameOrigin = false
    try {
      sameOrigin = !!document.referrer && new URL(document.referrer).origin === location.origin
    } catch {}
    if (sameOrigin && window.history.length > 1) {
      e.preventDefault()
      router.back()
    }
  }
}

export function BackButton({ fallback = '/' }: { fallback?: string }) {
  const onClick = useBackClick()

  return (
    <Link href={fallback} className="back-btn" onClick={onClick} aria-label="Go back">
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" />
      </svg>
      <span>Back</span>
    </Link>
  )
}
