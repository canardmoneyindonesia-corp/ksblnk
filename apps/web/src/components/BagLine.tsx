'use client'

import type { Product } from '@kskblnk/types'
import { formatPrice } from '@kskblnk/ui'
import Image from 'next/image'
import Link from 'next/link'
import { cart } from '@/lib/cart'
import { useStock } from '@/lib/stock'

/** One bag row (photo, name, price, then size · − qty + · Remove). Used by the checkout page and the home bag sheet. */
export function BagLine({
  product,
  label,
  sku,
  qty,
  out,
  available,
}: {
  product: Product
  label: string
  sku: string
  qty: number
  out: boolean
  /** Live units left for this sku, undefined when unknown. */
  available: number | undefined
}) {
  const img = product.images[0]
  const cap = available ?? Infinity
  const atCap = !out && qty >= cap
  const { stock, ready } = useStock()
  const multiSize = product.variants.length > 1
  return (
    <li className={`line${out ? ' line--out' : ''}`}>
      <Link href={`/p/${product.slug}`} className="line__media">
        {img && <Image src={img.url} alt={img.alt || product.name} fill sizes="96px" />}
      </Link>
      <div className="line__info">
        <div className="line__head">
          <span className="line__name">{product.name}</span>
          <span className="line__prices">
            <span className="line__price">{formatPrice(product.price * qty)}</span>
            {qty > 1 && <span className="line__unit">{formatPrice(product.price)} each</span>}
          </span>
        </div>
        {(!multiSize || out) && (
          <span className="line__meta">
            {!multiSize && <>Size {label}</>}
            {!multiSize && out && ' · '}
            {out && <strong>Sold out</strong>}
          </span>
        )}
        <div className="line__controls">
          {multiSize && (
            <select
              className="line__size"
              value={sku}
              onChange={(e) => {
                const to = e.target.value
                cart.changeSku(sku, to, ready && to in stock ? stock[to] : Infinity)
              }}
              aria-label={`Size for ${product.name}`}
            >
              {product.variants.map((v) => {
                const soldOut = v.sku !== sku && ready && stock[v.sku] === 0
                return (
                  <option key={v.sku} value={v.sku} disabled={soldOut}>
                    {v.label}
                    {soldOut ? ' · sold out' : ''}
                  </option>
                )
              })}
            </select>
          )}
          <div className="qty">
            <button
              aria-label={`Remove one ${product.name} ${label}`}
              onClick={() => cart.set(sku, qty - 1)}
              disabled={qty <= 1}
            >
              −
            </button>
            <span aria-live="polite">{qty}</span>
            <button
              aria-label={`Add one more ${product.name} ${label}`}
              onClick={() => cart.add(sku, 1, cap)}
              disabled={qty >= cap}
            >
              +
            </button>
          </div>
          <button className="line__remove" onClick={() => cart.remove([sku])}>
            Remove
          </button>
        </div>
        {atCap && <span className="line__note">Max for this drop</span>}
      </div>
    </li>
  )
}
