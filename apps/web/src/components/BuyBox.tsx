'use client'

import type { Variant } from '@kskblnk/types'
import Link from 'next/link'
import { useState } from 'react'
import { cart, cartCount, useCart } from '@/lib/cart'
import { formatCountdown } from '@/lib/format'
import { useCountdown, useStock } from '@/lib/stock'

export function BuyBox({ variants, dropAt }: { variants: Variant[]; dropAt: string | null }) {
  const { stock, ready } = useStock()
  const lines = useCart()
  const left = useCountdown(dropAt)
  const [selected, setSelected] = useState<string | null>(variants.length === 1 ? variants[0]!.sku : null)
  const [nudge, setNudge] = useState(false)

  const avail = (sku: string) => (ready && sku in stock ? stock[sku]! : undefined)
  const isOut = (sku: string) => avail(sku) === 0
  const qtyInBag = (sku: string) => lines.find((l) => l.sku === sku)?.qty ?? 0
  const allOut = ready && variants.length > 0 && variants.every((v) => isOut(v.sku))
  const notLive = dropAt !== null && (left === null || left > 0)

  const inBag = selected ? qtyInBag(selected) : 0
  const stockLeft = selected ? avail(selected) : undefined
  // Most units this buyer can take for the selected size: whatever stock is left.
  const cap = stockLeft ?? Infinity
  const canAddMore = inBag < cap
  const bagCount = cartCount(lines)

  function plus() {
    if (!selected) {
      setNudge(true)
      setTimeout(() => setNudge(false), 600)
      return
    }
    cart.add(selected, 1, cap)
  }

  function minus() {
    if (selected) cart.set(selected, inBag - 1)
  }

  let hint: React.ReactNode = null
  let cta: React.ReactNode
  if (notLive) {
    cta = (
      <button className="btn btn--primary" disabled>
        {left === null ? 'Coming soon' : `Drops in ${formatCountdown(left)}`}
      </button>
    )
  } else if (allOut) {
    cta = (
      <button className="btn btn--primary" disabled>
        Sold out
      </button>
    )
  } else if (selected && isOut(selected) && inBag === 0) {
    cta = (
      <button className="btn btn--primary" disabled>
        Sold out
      </button>
    )
  } else if (inBag === 0) {
    // First unit: the "+" is the add button.
    cta = (
      <button className="btn btn--primary" onClick={plus}>
        {selected ? (
          <>
            <span className="btn__plus" aria-hidden>
              +
            </span>{' '}
            Add to bag
          </>
        ) : (
          'Select a size'
        )}
      </button>
    )
  } else {
    // Already in the bag: keep the buyer on the page with a stepper, push for one more.
    hint = canAddMore
      ? `${inBag} in your bag. Grab another one, tap +`
      : stockLeft !== undefined && stockLeft < inBag
        ? stockLeft === 0
          ? 'This size just sold out. Remove it to check out.'
          : 'Not enough left in this size. Lower your quantity.'
        : 'No more available in this size.'
    cta = (
      <div className="cta-row">
        <div className="stepper" role="group" aria-label="Quantity in bag">
          <button aria-label="Remove one" onClick={minus}>
            −
          </button>
          <span aria-live="polite">{inBag}</span>
          <button
            aria-label="Add one more"
            className={canAddMore ? 'stepper__push' : undefined}
            onClick={plus}
            disabled={!canAddMore}
          >
            +
          </button>
        </div>
        <Link href="/checkout" className="btn btn--primary">
          Checkout ({bagCount}) →
        </Link>
      </div>
    )
  }

  return (
    <div className="buybox">
      {variants.length > 1 && (
        <div className={`sizes${nudge ? ' sizes--nudge' : ''}`} role="radiogroup" aria-label="Size">
          {variants.map((v) => {
            const out = isOut(v.sku)
            const q = qtyInBag(v.sku)
            return (
              <button
                key={v.sku}
                role="radio"
                aria-checked={selected === v.sku}
                className={`size${selected === v.sku ? ' size--on' : ''}${out ? ' size--out' : ''}`}
                disabled={out && q === 0}
                onClick={() => setSelected(v.sku)}
              >
                {v.label}
                {q > 0 && (
                  <span className="size__bag" aria-label={`${q} in bag`}>
                    {q}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
      <div className="cta-bar">
        {hint && (
          <p className="cta-hint" aria-live="polite">
            {hint}
          </p>
        )}
        {cta}
      </div>
    </div>
  )
}
