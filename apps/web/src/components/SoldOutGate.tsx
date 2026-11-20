'use client'

import { usePathname } from 'next/navigation'
import { useStock } from '@/lib/stock'
import { SoldOutScreen } from './SoldOutScreen'

/**
 * Sold-out mode: swaps the whole site (every route) for the sold-out screen once live stock
 * reads 0 for every SKU in the catalog, and back to the shop if pieces come back (expired
 * reservations, restock). Stays on the shop while stock is
 * unknown (first poll, API down, a SKU missing from the stock map) or while a product's drop
 * is still ahead, so it never hides a sale by mistake.
 *
 * The order result page (/checkout?order=…) is never replaced: whoever bought the last piece
 * still gets their confirmation and money rain.
 */
export function SoldOutGate({
  skus,
  dropAts,
  children,
}: {
  skus: string[]
  dropAts: string[]
  children: React.ReactNode
}) {
  const { stock, ready, offset } = useStock()
  const pathname = usePathname()

  const now = Date.now() + offset
  const soldOut =
    ready &&
    skus.length > 0 &&
    skus.every((s) => stock[s] === 0) &&
    !dropAts.some((d) => Date.parse(d) > now)

  // Only ever true after the first stock poll, i.e. in the browser, so reading location is safe.
  const orderPage = soldOut && pathname?.startsWith('/checkout') && new URLSearchParams(location.search).has('order')

  if (soldOut && !orderPage) return <SoldOutScreen />
  return <>{children}</>
}
