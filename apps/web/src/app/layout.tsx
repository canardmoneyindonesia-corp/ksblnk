import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { StockProvider } from '@/lib/stock'
import { sfPro, sfProItalic } from '@/fonts'
import './globals.css'

// Adobe Fonts web project (Adobe Kis + Acroterion JF). Adobe's terms require their embed
// rather than self-hosting, so the kit id comes from the env. Without it the CSS stacks
// in globals.css fall back to locally installed copies, then generic serif/cursive.
const adobeFontsKit = process.env.NEXT_PUBLIC_ADOBE_FONTS_KIT

export const metadata: Metadata = {
  title: { default: 'KSKBLNK', template: '%s · KSKBLNK' },
  description: 'KSKBLNK limited drops.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f4f3ef',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sfPro.variable} ${sfProItalic.variable}`}>
      <head>
        {adobeFontsKit && (
          <>
            <link rel="preconnect" href="https://use.typekit.net" crossOrigin="" />
            <link rel="stylesheet" href={`https://use.typekit.net/${adobeFontsKit}.css`} precedence="default" />
          </>
        )}
      </head>
      <body>
        <StockProvider>
          <header className="topbar">
            <Link href="/" className="logo" aria-label="Kasablanka home">
              KASABLANKA
            </Link>
          </header>
          <main>{children}</main>
        </StockProvider>
      </body>
    </html>
  )
}
