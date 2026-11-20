/**
 * Small status pill: "Sold out" or nothing. Stock counts are never shown to buyers.
 * `available` undefined = stock unknown, render nothing.
 */
export function StockBadge({ available }: { available: number | undefined }) {
  if (available !== undefined && available <= 0) return <span className="badge badge--out">Sold out</span>
  return null
}
