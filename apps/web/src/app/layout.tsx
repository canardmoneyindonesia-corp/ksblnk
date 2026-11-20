import type { Metadata, Viewport } from 'next'
import { MiniPlayer } from '@/components/MiniPlayer'
import { SoldOutGate } from '@/components/SoldOutGate'
import { Topbar } from '@/components/Topbar'
import { WaitingScreen } from '@/components/WaitingScreen'
import { getProducts } from '@/lib/products'
import { PlayerProvider } from '@/lib/player'
import { StockProvider } from '@/lib/stock'
import { isWaitingMode } from '@/lib/waiting'
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

/** What the sold-out gate watches: every SKU in the catalog, plus drops still to come. */
async function soldOutWatch() {
  try {
    const products = await getProducts()
    return {
      skus: products.flatMap((p) => p.variants.map((v) => v.sku)),
      dropAts: products.flatMap((p) => (p.dropAt ? [p.dropAt] : [])),
    }
  } catch {
    return { skus: [], dropAts: [] } // CMS unreachable: no auto sold-out, the page itself decides
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const waiting = isWaitingMode()
  const watch = waiting ? { skus: [], dropAts: [] } : await soldOutWatch()
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
      {waiting ? (
        // Pre-drop: only the loop. Every route lands here, so no product, price or link leaks.
        <body>
          <WaitingScreen />
        </body>
      ) : (
      <body>
        <StockProvider>
          <PlayerProvider>
            <MiniPlayer />
            <SoldOutGate skus={watch.skus} dropAts={watch.dropAts}>
              <Topbar />
              <main>{children}</main>
            </SoldOutGate>
          </PlayerProvider>
        </StockProvider>
      </body>
      )}
    </html>
  )
}
