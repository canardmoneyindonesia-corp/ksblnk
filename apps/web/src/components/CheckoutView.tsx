'use client'

import type { CheckoutErrorCode, Product, ShippingInput } from '@kskblnk/types'
import { shippingSchema } from '@kskblnk/types'
import { formatPrice } from '@kskblnk/ui'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { cart, useCart } from '@/lib/cart'
import { useStock } from '@/lib/stock'
import { AddOns } from './AddOns'
import { BagLine } from './BagLine'
import { GayaHidupInfo } from './GayaHidupInfo'
import { InfoTip } from './InfoTip'
import { OrderResult } from './OrderResult'
import { ShippingForm, useSavedShipping } from './ShippingForm'

const MESSAGES: Record<CheckoutErrorCode, string> = {
  SOLD_OUT: 'Someone was faster: the items marked below just sold out.',
  UNAVAILABLE: 'Some items are no longer available.',
  NOT_LIVE: 'This drop is not live yet.',
  RATE_LIMITED: 'Too many attempts. Wait a minute and try again.',
  INVALID: 'Please check your bag and shipping details.',
  PAYMENT_PROVIDER: 'Payment is temporarily unavailable. Please retry.',
}

export function CheckoutView({ products }: { products: Product[] }) {
  const params = useSearchParams()
  const orderId = params.get('order')
  // Back from the DOKU payment page.
  if (orderId) return <OrderResult orderId={orderId} cancelled={params.get('cancelled') === '1'} />
  return <Bag products={products} step={params.get('step') === 'shipping' ? 'shipping' : 'bag'} />
}

type FieldErrors = Partial<Record<keyof ShippingInput, string>>

/**
 * Two steps on the same page (state survives the search-param change):
 *   1. /checkout                — bag lines + totals → "Continue"
 *   2. /checkout?step=shipping  — shipping details + totals → "Pay"
 */
function Bag({ products, step }: { products: Product[]; step: 'bag' | 'shipping' }) {
  const router = useRouter()
  const lines = useCart()
  const { stock, ready, shippingFee, demo, refresh } = useStock()
  const [shipping, setShipping] = useSavedShipping()
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<{ message: string; skus: string[] } | null>(null)

  const bySku = useMemo(() => {
    const m = new Map<string, { product: Product; label: string }>()
    for (const p of products) for (const v of p.variants) m.set(v.sku, { product: p, label: v.label })
    return m
  }, [products])

  const rows = lines
    .map((l) => ({ ...l, ...bySku.get(l.sku) }))
    .filter((r): r is typeof r & { product: Product; label: string } => Boolean(r.product))

  const unknown = lines.filter((l) => !bySku.has(l.sku)).map((l) => l.sku)
  const outSkus = rows.filter((r) => ready && (stock[r.sku] ?? Infinity) < r.qty).map((r) => r.sku)
  const flagged = new Set([...outSkus, ...(error?.skus ?? [])])
  const subtotal = rows.reduce((n, r) => n + r.product.price * r.qty, 0)
  const total = subtotal + shippingFee

  function updateShipping(patch: Partial<ShippingInput>) {
    setShipping(patch)
    // Clear the error of a field as soon as the buyer edits it.
    setFieldErrors((e) => {
      const next = { ...e }
      for (const k of Object.keys(patch)) delete next[k as keyof ShippingInput]
      return next
    })
  }

  async function pay() {
    const parsed = shippingSchema.safeParse(shipping)
    if (!parsed.success) {
      const errs: FieldErrors = {}
      for (const issue of parsed.error.issues) {
        const k = issue.path[0] as keyof ShippingInput
        errs[k] ??= issue.message
      }
      setFieldErrors(errs)
      document.getElementById(`ship-${Object.keys(errs)[0]}`)?.focus()
      return
    }
    setPending(true)
    setError(null)
    const res = await api.checkout(
      rows.map((r) => ({ sku: r.sku, qty: r.qty })),
      shipping,
    )
    if (res.ok) {
      window.location.assign(res.url) // DOKU payment page (or the result page in mock mode)
      return // keep the button disabled while the payment page loads
    }
    setPending(false)
    const skus = res.skus ?? []
    setError({ message: res.message ?? MESSAGES[res.code], skus })
    refresh()
    // Sold-out / unavailable lines are fixed on the bag step: send the buyer back there.
    if (skus.length) router.push('/checkout', { scroll: true })
  }

  function toShipping() {
    setError(null)
    router.push('/checkout?step=shipping', { scroll: true })
  }

  if (!rows.length) {
    return (
      <section className="notice">
        {unknown.length > 0 && <UnknownCleaner skus={unknown} />}
        <h1>Your bag is empty.</h1>
        <Link href="/" className="btn btn--primary">
          Shop the drop
        </Link>
      </section>
    )
  }

  const count = rows.reduce((n, r) => n + r.qty, 0)

  const summary = (
    <div className="summary summary--card">
      <div className="summary__row summary__row--sub">
        <span>
          Subtotal · {count} {count === 1 ? 'item' : 'items'}
        </span>
        <span>{formatPrice(subtotal)}</span>
      </div>
      <div className="summary__row summary__row--sub">
        <span className="summary__label">
          Ongkos kirim <InfoTip text="All over Indonesia" label="Where do you ship?" />
        </span>
        <span>{shippingFee ? formatPrice(shippingFee) : 'Included'}</span>
      </div>
      <div className="summary__row summary__row--sub">
        <span className="summary__label">
          Gaya hidup <GayaHidupInfo />
        </span>
        <span>Included</span>
      </div>
      <div className="summary__row summary__row--sub">
        <span>Swag</span>
        <span>Included</span>
      </div>
      <div className="summary__row summary__row--total">
        <span>Total</span>
        <span>{formatPrice(total)}</span>
      </div>
      <p className="summary__note">
        {demo ? (
          <>Demo store · no payment is taken, orders are confirmed instantly.</>
        ) : (
          <>
            <LockIcon /> Secure payment · QRIS, GoPay, OVO, DANA, ShopeePay, virtual account or card.
          </>
        )}
      </p>
    </div>
  )

  if (step === 'shipping') {
    const thumbs = rows.slice(0, 4)
    return (
      <section className="checkout">
        <Steps step="shipping" />
        <h1 className="checkout__title">Shipping</h1>

        <Link href="/checkout" className="recap" aria-label="Edit bag">
          <span className="recap__thumbs">
            {thumbs.map((r) => {
              const img = r.product.images[0]
              return (
                <span key={r.sku} className="recap__thumb">
                  {img && <Image src={img.url} alt="" fill sizes="40px" />}
                </span>
              )
            })}
            {rows.length > thumbs.length && <span className="recap__more">+{rows.length - thumbs.length}</span>}
          </span>
          <span className="recap__text">
            <strong>
              {count} {count === 1 ? 'item' : 'items'}
            </strong>
            <span>{formatPrice(subtotal)}</span>
          </span>
          <span className="recap__edit">Edit</span>
        </Link>

        <ShippingForm value={shipping} onChange={updateShipping} errors={fieldErrors} />

        {summary}

        {error && <p className="alert alert--error">{error.message}</p>}

        <div className="cta-bar">
          <button className="btn btn--primary btn--icon" onClick={pay} disabled={pending || flagged.size > 0}>
            {pending ? (
              'Securing your items…'
            ) : (
              <>
                <LockIcon /> Pay {formatPrice(total)}
              </>
            )}
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="checkout">
      <Steps step="bag" />
      {unknown.length > 0 && <UnknownCleaner skus={unknown} />}

      <ul className="lines">
        {rows.map((r) => (
          <BagLine
            key={r.sku}
            product={r.product}
            label={r.label}
            sku={r.sku}
            qty={r.qty}
            out={flagged.has(r.sku)}
            available={ready && r.sku in stock ? stock[r.sku] : undefined}
          />
        ))}
      </ul>

      {flagged.size > 0 && (
        <button className="btn btn--ghost" onClick={() => (cart.remove([...flagged]), setError(null))}>
          Remove sold-out items
        </button>
      )}

      <AddOns products={products} lines={lines} />

      {summary}

      {error && <p className="alert alert--error">{error.message}</p>}

      <div className="cta-bar">
        <button className="btn btn--primary btn--icon" onClick={toShipping} disabled={flagged.size > 0}>
          Continue to shipping <ArrowIcon />
        </button>
      </div>
    </section>
  )
}

/** Back button + "1 Bag / 2 Shipping" progress. The finished step links back. */
function Steps({ step }: { step: 'bag' | 'shipping' }) {
  const onShipping = step === 'shipping'
  const bag = (
    <>
      <span className="steps__num">{onShipping ? <CheckIcon /> : '1'}</span>
      Bag
    </>
  )
  return (
    <div className="steps-bar">
      <Link
        href={onShipping ? '/checkout' : '/'}
        className="steps-bar__back"
        aria-label={onShipping ? 'Back to bag' : 'Back to shop'}
      >
        <BackIcon />
      </Link>
      <ol className="steps" aria-label="Checkout progress">
        <li
          className={`steps__item ${onShipping ? 'is-done' : 'is-current'}`}
          aria-current={onShipping ? undefined : 'step'}
        >
          {onShipping ? <Link href="/checkout">{bag}</Link> : <span>{bag}</span>}
        </li>
        <li
          className={`steps__item${onShipping ? ' is-current' : ''}`}
          aria-current={onShipping ? 'step' : undefined}
        >
          <span>
            <span className="steps__num">2</span>
            Shipping
          </span>
        </li>
      </ol>
    </div>
  )
}

const BackIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" className="icon">
    <path d="M19 12H6M11 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" />
  </svg>
)

const LockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" className="icon">
    <rect x="5" y="11" width="14" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="2.5" />
  </svg>
)

const ArrowIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" className="icon">
    <path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" />
  </svg>
)

const CheckIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 12l5 5L20 6" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="square" />
  </svg>
)

/** Drops bag lines whose product was removed from the catalog. */
function UnknownCleaner({ skus }: { skus: string[] }) {
  useEffect(() => cart.remove(skus), [skus])
  return null
}
