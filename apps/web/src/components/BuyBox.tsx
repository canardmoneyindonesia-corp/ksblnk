'use client'

import type { Variant } from '@kskblnk/types'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { cart, cartCount, useCart } from '@/lib/cart'
import { formatCountdown } from '@/lib/format'
import { useCountdown, useStock } from '@/lib/stock'
import { useBackClick } from './BackButton'
import { CtaShape } from './CtaShape'

export function BuyBox({ variants, dropAt }: { variants: Variant[]; dropAt: string | null }) {
  const { stock, ready } = useStock()
  const lines = useCart()
  const left = useCountdown(dropAt)
  const [selected, setSelected] = useState<string | null>(variants.length === 1 ? variants[0]!.sku : null)
  const [nudge, setNudge] = useState(false)
  const back = useBackClick()

  const avail = (sku: string) => (ready && sku in stock ? stock[sku]! : undefined)
  const isOut = (sku: string) => avail(sku) === 0
  const qtyInBag = (sku: string) => lines.find((l) => l.sku === sku)?.qty ?? 0
  const allOut = ready && variants.length > 0 && variants.every((v) => isOut(v.sku))
  const notLive = dropAt !== null && (left === null || left > 0)

  const selectedVariant = selected ? variants.find((v) => v.sku === selected) : undefined
  const selectedDetail = selectedVariant?.detail
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
      <button className="btn btn--cta" disabled>
        <CtaShape />
        {left === null ? 'Coming soon' : `Drops in ${formatCountdown(left)}`}
      </button>
    )
  } else if (allOut) {
    cta = (
      <button className="btn btn--cta" disabled>
        <CtaShape />
        Sold out
      </button>
    )
  } else if (selected && isOut(selected) && inBag === 0) {
    cta = (
      <button className="btn btn--cta" disabled>
        <CtaShape />
        Sold out
      </button>
    )
  } else if (inBag === 0) {
    // First unit: the "+" is the add button.
    cta = (
      <button className="btn btn--cta" onClick={plus}>
        <CtaShape />
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
    // Already in the bag: stepper for one more, checkout, or back to the grid for other pieces.
    hint = canAddMore
      ? null
      : stockLeft !== undefined && stockLeft < inBag
        ? stockLeft === 0
          ? 'This size just sold out. Remove it to check out.'
          : 'Not enough left in this size. Lower your quantity.'
        : 'No more available in this size.'
    cta = (
      <>
      <Link href="/" className="btn btn--shop" onClick={back}>
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" />
        </svg>
        Keep shopping
      </Link>
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
        <Link href="/checkout" className="btn btn--cta btn--icon">
          <CtaShape />
          Checkout ({bagCount})
          <Image src="/icons/rambu-rp.png" alt="" width={28} height={28} className="btn__rambu" />
        </Link>
      </div>
      </>
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
      {selectedDetail && (
        <p className="size-detail" aria-live="polite">
          <span className="size-detail__label">{selectedVariant!.label}</span>
          {selectedDetail}
        </p>
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
