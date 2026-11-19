'use client'

import { LIMITS, type CartLine, type Product } from '@kskblnk/types'
import { formatPrice } from '@kskblnk/ui'
import Image from 'next/image'
import Link from 'next/link'
import { useStock } from '@/lib/stock'
import { QuickAdd } from './QuickAdd'

const MAX = 6

/**
 * "Add a little extra" row on the bag step: the cheapest live, in-stock products
 * that aren't in the bag yet, as small cards with the same "+" as the home grid.
 * Low-price picks are easy yes-es, which lifts the average basket.
 */
export function AddOns({ products, lines }: { products: Product[]; lines: CartLine[] }) {
  const { stock, ready } = useStock()
  if (lines.length >= LIMITS.maxLines) return null // bag full: nothing could be added

  const inBag = new Set(lines.map((l) => l.sku))
  const now = Date.now()
  const picks = products
    .filter((p) => p.variants.length > 0)
    .filter((p) => !p.variants.some((v) => inBag.has(v.sku)))
    .filter((p) => !p.dropAt || Date.parse(p.dropAt) <= now)
    .filter((p) => !ready || p.variants.some((v) => (stock[v.sku] ?? Infinity) > 0))
    .sort((a, b) => a.price - b.price)
    .slice(0, MAX)

  if (!picks.length) return null

  return (
    <section className="addons" aria-labelledby="addons-title">
      <div className="addons__head">
        <h2 id="addons-title" className="addons__title">
          Add a little extra
        </h2>
        <span className="addons__sub">From {formatPrice(picks[0]!.price)}</span>
      </div>
      <ul className="addons__list">
        {picks.map((p) => {
          const img = p.images[0]
          return (
            <li key={p.id} className="addon">
              <QuickAdd id={`addon-${p.id}`} name={p.name} variants={p.variants} dropAt={p.dropAt} />
              <Link href={`/p/${p.slug}`} className="addon__link">
                <span className="addon__media">
                  {img && <Image src={img.url} alt={img.alt || p.name} fill sizes="120px" />}
                </span>
                <span className="addon__name">{p.name}</span>
                <span className="addon__price">{formatPrice(p.price)}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
