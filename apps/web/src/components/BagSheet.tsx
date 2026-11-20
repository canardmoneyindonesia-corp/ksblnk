'use client'

import type { Product } from '@kskblnk/types'
import { formatPrice } from '@kskblnk/ui'
import Link from 'next/link'
import { useEffect, useMemo, useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { cart, cartCount, useCart } from '@/lib/cart'
import { shopUi, useSheetOpen } from '@/lib/shop-ui'
import { useStock } from '@/lib/stock'
import { BagLine } from './BagLine'
import { CtaShape } from './CtaShape'

/** Rubber band: the further you pull past a limit, the less it moves. */
const resist = (x: number, k = 120) => x / (1 + Math.abs(x) / k)

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Home page bag: a floating frosted pill (count, subtotal) pinned to the bottom,
 * with the full checkout CTA on its own row beneath it. Tap it or swipe it up to open a sheet with every line and its
 * − / + buttons; swipe the sheet down (or tap outside) to close it.
 */
export function BagSheet({ products }: { products: Product[] }) {
  const lines = useCart()
  const open = useSheetOpen()
  const { stock, ready, shippingFee } = useStock()

  useEffect(() => shopUi.mountSheet(), [])

  /* ------------------------------------------------------------ swipe */
  const sheetRef = useRef<HTMLElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: number; y0: number; dy: number; v: number; lastY: number; lastT: number; active: boolean } | null>(null)
  // A drag must not also count as a tap on the toggle or on Checkout.
  const swallowClick = useRef(false)

  function settle(transform: string, after?: () => void) {
    const el = sheetRef.current
    if (!el) return
    const ms = reducedMotion() ? 0 : 240
    el.style.transition = `transform ${ms}ms cubic-bezier(0.2, 0.8, 0.2, 1)`
    el.style.transform = transform
    if (backdropRef.current) {
      backdropRef.current.style.transition = `opacity ${ms}ms ease-out`
      backdropRef.current.style.opacity = after ? '0' : ''
    }
    window.setTimeout(() => {
      after?.()
      el.style.transition = ''
      el.style.transform = ''
      if (backdropRef.current) backdropRef.current.style.transition = ''
    }, ms)
  }

  function onPointerDown(e: ReactPointerEvent) {
    swallowClick.current = false
    if (e.pointerType === 'mouse' && e.button !== 0) return
    drag.current = { id: e.pointerId, y0: e.clientY, dy: 0, v: 0, lastY: e.clientY, lastT: e.timeStamp, active: false }
  }

  function onPointerMove(e: ReactPointerEvent) {
    const d = drag.current
    const el = sheetRef.current
    if (!d || !el || e.pointerId !== d.id) return
    const dy = e.clientY - d.y0
    if (!d.active) {
      if (Math.abs(dy) < 8) return // still a tap
      d.active = true
      // Capture only once it is a real drag, so plain taps still reach the buttons.
      e.currentTarget.setPointerCapture(e.pointerId)
      el.style.transition = 'none'
    }
    const dt = e.timeStamp - d.lastT
    if (dt > 0) d.v = (e.clientY - d.lastY) / dt
    d.lastY = e.clientY
    d.lastT = e.timeStamp
    d.dy = dy

    const y = open ? (dy > 0 ? dy : resist(dy, 40)) : resist(dy, dy < 0 ? 90 : 20)
    el.style.transform = `translateY(${y}px)`
    if (open && backdropRef.current) {
      backdropRef.current.style.opacity = String(Math.max(0, 1 - Math.max(0, dy) / el.offsetHeight))
    }
  }

  function onPointerEnd(e: ReactPointerEvent) {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    drag.current = null
    if (!d.active) return
    swallowClick.current = true

    if (open) {
      const close = e.type !== 'pointercancel' && (d.dy > 90 || (d.v > 0.5 && d.dy > 24))
      if (close) settle('translateY(110%)', () => shopUi.setSheet(false))
      else settle('')
    } else {
      const openIt = e.type !== 'pointercancel' && (d.dy < -40 || (d.v < -0.4 && d.dy < -12))
      if (openIt) {
        const el = sheetRef.current
        if (el) {
          el.style.transition = ''
          el.style.transform = ''
        }
        shopUi.setSheet(true)
      } else settle('')
    }
  }

  const grab = {
    onPointerDown,
    onPointerMove,
    onPointerUp: onPointerEnd,
    onPointerCancel: onPointerEnd,
    onClickCapture: (e: ReactMouseEvent) => {
      if (!swallowClick.current) return
      swallowClick.current = false
      e.preventDefault()
      e.stopPropagation()
    },
  }

  const bySku = useMemo(() => {
    const m = new Map<string, { product: Product; label: string }>()
    for (const p of products) for (const v of p.variants) m.set(v.sku, { product: p, label: v.label })
    return m
  }, [products])

  const rows = lines
    .map((l) => ({ ...l, ...bySku.get(l.sku) }))
    .filter((r): r is typeof r & { product: Product; label: string } => Boolean(r.product))
  const count = cartCount(rows)
  const subtotal = rows.reduce((n, r) => n + r.product.price * r.qty, 0)
  const avail = (sku: string) => (ready && sku in stock ? stock[sku]! : undefined)
  const outSkus = rows.filter((r) => (avail(r.sku) ?? Infinity) < r.qty).map((r) => r.sku)
  const canAddMore = rows.some((r) => r.qty < (avail(r.sku) ?? Infinity))

  // Empty bag: nothing to show.
  useEffect(() => {
    if (!count) shopUi.setSheet(false)
  }, [count])

  // Escape closes; lock the page scroll behind the open sheet.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && shopUi.setSheet(false)
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open])

  if (!count) return null

  const checkout = (
    <Link href="/checkout" className="btn btn--cta" onClick={() => shopUi.setSheet(false)}>
      <CtaShape />
      Checkout · {formatPrice(subtotal)}
    </Link>
  )

  return (
    <>
      {/* Keeps the last grid row clear of the fixed bar. */}
      <div className="bagbar-spacer" aria-hidden />

      {open && <div className="sheet-backdrop" ref={backdropRef} onClick={() => shopUi.setSheet(false)} />}

      {/* Only the open sheet: collapsed, the basket + CTA row below is the whole bag UI. */}
      {open && (
      <section ref={sheetRef} className={`sheet${open ? ' sheet--open' : ''}`} aria-label="Bag">
        <div className="sheet__grab" {...grab}>
          <span className="sheet__handle" aria-hidden />
          <div className="bagbar">
            <button
              className="bagbar__toggle"
              onClick={() => shopUi.setSheet(!open)}
              aria-expanded={open}
              aria-controls="bag-sheet-body"
            >
              <span className="bag-count bag-count--on" key={count}>
                {count}
              </span>
              <span className="bagbar__label">
                Bag
                <small>{formatPrice(subtotal)}</small>
              </span>
              <span className="bagbar__chev" aria-hidden>
                {open ? '▾' : '▴'}
              </span>
            </button>
          </div>
        </div>

        {open && (
          <div className="sheet__body" id="bag-sheet-body">
            <ul className="lines">
              {rows.map((r) => (
                <BagLine
                  key={r.sku}
                  product={r.product}
                  label={r.label}
                  sku={r.sku}
                  qty={r.qty}
                  out={outSkus.includes(r.sku)}
                  available={avail(r.sku)}
                />
              ))}
            </ul>
            {outSkus.length > 0 && (
              <button className="btn btn--ghost" onClick={() => cart.remove(outSkus)}>
                Remove sold-out items
              </button>
            )}
            {canAddMore && <p className="sheet__hint">Tap + to take another one.</p>}
            <div className="summary">
              <div className="summary__row">
                <span>Subtotal</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              <p className="summary__note">
                {shippingFee ? 'Gaya hidup & swag included. Ongkos kirim added at checkout.' : 'Ongkos kirim, gaya hidup & swag included.'}
              </p>
            </div>
            <div className="sheet__cta">{checkout}</div>
          </div>
        )}
      </section>
      )}

      {/* Collapsed: round basket (opens the bag) + the full checkout CTA. */}
      {!open && (
        <div className="bag-cta">
          <button
            className="bag-cta__basket"
            onClick={() => shopUi.setSheet(true)}
            aria-label={`Open bag, ${count} ${count === 1 ? 'item' : 'items'}`}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2.5 10.5h19" />
                <path d="M4 10.5l1.7 8a2 2 0 0 0 2 1.5h8.6a2 2 0 0 0 2-1.5l1.7-8" />
                <path d="M6.5 10.5 10 4M17.5 10.5 14 4" />
                <path d="M9.5 14v3M14.5 14v3" />
              </g>
            </svg>
          </button>
          {checkout}
        </div>
      )}
    </>
  )
}
