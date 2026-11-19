'use client'

import type { Product } from '@kskblnk/types'
import { formatPrice } from '@kskblnk/ui'
import Image from 'next/image'
import Link from 'next/link'
import { cart } from '@/lib/cart'
import { useStock } from '@/lib/stock'

/** One bag row (photo, name, size picker, − qty +, price). Used by the checkout page and the home bag sheet. */
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
  const { stock, ready } = useStock()
  return (
    <li className={`line${out ? ' line--out' : ''}`}>
      <Link href={`/p/${product.slug}`} className="line__media">
        {img && <Image src={img.url} alt={img.alt || product.name} fill sizes="96px" />}
      </Link>
      <div className="line__info">
        <span className="line__name">{product.name}</span>
        <span className="line__meta">
          {product.variants.length > 1 ? (
            <label className="line__size">
              <span className="line__size-label">Size</span>
              <select
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
            </label>
          ) : (
            <>Size {label}</>
          )}
          {out && <strong> · Sold out</strong>}
        </span>
        <div className="qty">
          <button aria-label={`Remove one ${product.name} ${label}`} onClick={() => cart.set(sku, qty - 1)}>
            −
          </button>
          <span>{qty}</span>
          <button
            aria-label={`Add one more ${product.name} ${label}`}
            className={qty < cap ? 'qty__push' : undefined}
            onClick={() => cart.add(sku, 1, cap)}
            disabled={qty >= cap}
          >
            +
          </button>
        </div>
      </div>
      <span className="line__price">{formatPrice(product.price * qty)}</span>
    </li>
  )
}
