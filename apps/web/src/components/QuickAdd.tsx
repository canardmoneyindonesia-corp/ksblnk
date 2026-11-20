'use client'

import type { Variant } from '@kskblnk/types'
import { useEffect, useRef, useState } from 'react'
import { cart, useCart } from '@/lib/cart'
import { shopUi, useOpenPicker } from '@/lib/shop-ui'
import { useCountdown, useStock } from '@/lib/stock'
import { CtaShape } from './CtaShape'

/** Buttons that arrow keys move between (not the sheet's "×", hidden on desktop). */
const NAV_BUTTONS = '.quick__opt button:not(:disabled), .quick__done'

/**
 * "+" on a home grid card. One size: adds straight to the bag.
 * Several sizes: "+" opens a size list with a −/count/+ per size; "Done" or "×" closes it.
 */
export function QuickAdd({ id, name, variants, dropAt }: { id: string; name: string; variants: Variant[]; dropAt: string | null }) {
  const { stock, ready } = useStock()
  const lines = useCart()
  const left = useCountdown(dropAt)
  const open = useOpenPicker() === id
  const [msg, setMsg] = useState<string | null>(null)
  const [flash, setFlash] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const menu = useRef<HTMLUListElement>(null)

  const avail = (sku: string) => (ready && sku in stock ? stock[sku]! : undefined)
  const qtyInBag = (sku: string) => lines.find((l) => l.sku === sku)?.qty ?? 0
  const capFor = (sku: string) => avail(sku) ?? Infinity
  const inBag = variants.reduce((n, v) => n + qtyInBag(v.sku), 0)
  const notLive = dropAt !== null && (left === null || left > 0)
  const allOut = ready && variants.length > 0 && variants.every((v) => avail(v.sku) === 0)

  // Close the dropdown on outside tap or Escape; put keyboard focus on the first size.
  useEffect(() => {
    if (!open) return
    menu.current?.querySelector<HTMLButtonElement>(NAV_BUTTONS)?.focus({ preventScroll: true })
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) shopUi.openPicker(null)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && shopUi.openPicker(null)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    // Phones/tablets show the list as a bottom sheet: lock the page scroll behind it.
    const sheet = window.matchMedia('(max-width: 1023.98px)').matches
    const prev = document.body.style.overflow
    if (sheet) document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
      if (sheet) document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(false), 900)
    return () => clearTimeout(t)
  }, [flash])

  // A "max reached" note under the closed "+" fades after a moment.
  useEffect(() => {
    if (!msg || open) return
    const t = setTimeout(() => setMsg(null), 1800)
    return () => clearTimeout(t)
  }, [msg, open])

  if (notLive || allOut || !variants.length) return null

  // One size: "+" adds straight to the bag. In the size list each row has its own
  // −/count/+ so several sizes and amounts can be set before closing.
  function add(sku: string) {
    const r = cart.add(sku, 1, capFor(sku))
    if (r === 'added') {
      setMsg(null)
      if (!open) setFlash(true)
    } else {
      setMsg('No more left in this size')
    }
  }

  function minus(sku: string) {
    setMsg(null)
    cart.set(sku, qtyInBag(sku) - 1)
  }

  function onPlus() {
    setMsg(null)
    if (variants.length === 1) add(variants[0]!.sku)
    else shopUi.openPicker(open ? null : id)
  }

  // Arrow keys move between the size rows' buttons.
  function onMenuKey(e: React.KeyboardEvent<HTMLUListElement>) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>(NAV_BUTTONS)]
    const i = items.indexOf(document.activeElement as HTMLButtonElement)
    const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length
    items[next]?.focus()
  }

  return (
    <div className={`quick${open ? ' quick--open' : ''}`} ref={root}>
      {/* Dims the page behind the phone bottom sheet (hidden on desktop, where the list is a dropdown). */}
      {open && <div className="quick__backdrop" onClick={() => shopUi.openPicker(null)} aria-hidden />}
      {open && (
        <ul className="quick__menu" aria-label={`Choose sizes for ${name}`} ref={menu} onKeyDown={onMenuKey}>
          <li role="presentation" className={`quick__menu-head${msg ? ' quick__menu-head--error' : ''}`}>
            <span>{msg ?? 'Choose size'}</span>
            {/* Phone bottom sheet only (CSS): the card's "×" stays on the card, far from the sheet. */}
            <button className="quick__close" onClick={() => shopUi.openPicker(null)} aria-label="Close sizes">
              ×
            </button>
          </li>
          {variants.map((v) => {
            const n = avail(v.sku)
            const q = qtyInBag(v.sku)
            const out = n === 0
            const maxed = q >= capFor(v.sku)
            return (
              <li key={v.sku} role="group" aria-label={`Size ${v.label}`} className={`quick__opt${out ? ' quick__opt--out' : ''}${q > 0 ? ' quick__opt--in' : ''}`}>
                <span className="quick__opt-text">
                  <span className="quick__opt-top">
                    <span className="quick__opt-label">{v.label}</span>
                    {out && <span className="quick__opt-meta">Sold out</span>}
                  </span>
                  {v.detail && <span className="quick__opt-detail">{v.detail}</span>}
                </span>
                <span className="quick__step">
                  <button
                    onClick={() => minus(v.sku)}
                    disabled={q === 0}
                    aria-label={`Remove one size ${v.label}`}
                  >
                    −
                  </button>
                  <span className="quick__step-n" aria-live="polite" aria-label={`${q} in bag`}>
                    {q}
                  </span>
                  <button
                    onClick={() => add(v.sku)}
                    disabled={out || maxed}
                    aria-label={`Add one size ${v.label}`}
                  >
                    +
                  </button>
                </span>
              </li>
            )
          })}
          <li role="presentation" className="quick__menu-foot">
            <button className="btn btn--cta quick__done" onClick={() => shopUi.openPicker(null)}>
              <CtaShape />
              {inBag > 0 ? `Done · ${inBag} in bag` : 'Done'}
            </button>
          </li>
        </ul>
      )}
      {!open && msg && <span className="quick__msg">{msg}</span>}
      <button
        className={`quick__plus${flash ? ' quick__plus--done' : ''}${open ? ' quick__plus--open' : ''}`}
        onClick={onPlus}
        aria-label={open ? 'Close sizes' : `Add ${name} to bag`}
        aria-haspopup={variants.length > 1 ? 'true' : undefined}
        aria-expanded={variants.length > 1 ? open : undefined}
      >
        {flash ? '✓' : '+'}
        {inBag > 0 && !open && <span className="size__bag">{inBag}</span>}
      </button>
    </div>
  )
}
