'use client'

import { StockBadge } from '@kskblnk/ui'
import { formatCountdown } from '@/lib/format'
import { useAvailable, useCountdown } from '@/lib/stock'

/** Live overlay on a static product card: countdown before the drop, sold out / low stock after. */
export function CardStatus({ skus, dropAt }: { skus: string[]; dropAt: string | null }) {
  const left = useCountdown(dropAt)
  const available = useAvailable(skus)

  if (left !== null && left > 0) {
    return (
      <div className="card__status">
        <span className="badge badge--soon">{formatCountdown(left)}</span>
      </div>
    )
  }
  return (
    <div className="card__status">
      <StockBadge available={available} />
    </div>
  )
}
