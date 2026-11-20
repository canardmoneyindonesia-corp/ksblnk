'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogoMark } from './LogoMark'

/** The animated-logo banner. Hidden on product pages (/p/…), which open straight onto
 *  the photos and have their own back button, and on checkout (/checkout…). */
export function Topbar() {
  const pathname = usePathname()
  if (pathname?.startsWith('/p/') || pathname?.startsWith('/checkout')) return null

  return (
    <header className="topbar">
      <Link href="/" className="logo" aria-label="Kasablanka home">
        <LogoMark />
      </Link>
    </header>
  )
}
