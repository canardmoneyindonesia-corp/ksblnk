/** Small status pill. `available` undefined = stock unknown, render nothing. */
export function StockBadge({ available, lowAt = 5 }: { available: number | undefined; lowAt?: number }) {
  if (available === undefined) return null
  if (available <= 0) return <span className="badge badge--out">Sold out</span>
  if (available <= lowAt) return <span className="badge badge--low">Last {available}</span>
  return null
}
