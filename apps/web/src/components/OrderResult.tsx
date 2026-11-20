'use client'

import type { OrderStatusResponse } from '@kskblnk/types'
import { formatPrice } from '@kskblnk/ui'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { cart } from '@/lib/cart'
import { MoneyRain } from './MoneyRain'
import { CtaShape } from './CtaShape'

const wib = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })

/**
 * Shown when the buyer comes back from DOKU (/checkout?order=…).
 * With QRIS / e-wallets the payment is usually already confirmed; with a bank
 * virtual account the buyer may still have to pay, so we keep polling.
 */
export function OrderResult({ orderId, cancelled }: { orderId: string; cancelled: boolean }) {
  const [order, setOrder] = useState<OrderStatusResponse | null>(null)
  const [failed, setFailed] = useState(false)
  const cleared = useRef(false)

  useEffect(() => {
    let stop = false
    let timer: ReturnType<typeof setTimeout>
    const tick = async () => {
      try {
        const o = await api.getOrder(orderId)
        if (stop) return
        setOrder(o)
        setFailed(false)
        if (o.status === 'sold' && !cleared.current) {
          cleared.current = true
          cart.clear()
        }
        if (o.status !== 'held' && o.status !== 'pending_payment') return // final state
      } catch {
        if (!stop) setFailed(true)
      }
      timer = setTimeout(tick, 3000)
    }
    void tick()
    return () => {
      stop = true
      clearTimeout(timer)
    }
  }, [orderId])

  if (!order) {
    return (
      <section className="notice">
        <h1>{failed ? 'Connection problem.' : 'Checking your payment…'}</h1>
        {failed && <p>We'll keep trying. Don't pay twice.</p>}
      </section>
    )
  }

  switch (order.status) {
    case 'sold':
      return (
        <section className="notice">
          <MoneyRain orderId={orderId} />
          <h1>Terima kasih.</h1>
          <p>
            Payment received{order.amount ? ` (${formatPrice(order.amount)})` : ''}. We'll contact you on WhatsApp /
            email when your order ships.
          </p>
          <p className="notice__ref">Order {orderId}</p>
          <Link href="/" className="btn btn--cta">
            <CtaShape />
            Back to the shop
          </Link>
        </section>
      )

    case 'held':
    case 'pending_payment':
      return (
        <section className="notice">
          <h1>{cancelled ? 'Payment not finished.' : 'Waiting for your payment…'}</h1>
          <p>
            Your items are reserved
            {order.payBefore ? ` until ${wib.format(order.payBefore)} WIB` : ''}. Paid by bank transfer / virtual
            account? This page updates by itself once it arrives.
          </p>
          {order.paymentUrl && (
            <a href={order.paymentUrl} className="btn btn--cta">
              <CtaShape />
              Continue payment{order.amount ? ` · ${formatPrice(order.amount)}` : ''}
            </a>
          )}
          <Link href="/checkout" className="btn btn--ghost">
            Back to bag
          </Link>
          <p className="notice__ref">Order {orderId}</p>
        </section>
      )

    case 'oversold':
      return (
        <section className="notice">
          <h1>Sorry, sold out.</h1>
          <p>
            Your payment arrived after your reservation expired and the last pieces were taken. You will be refunded
            in full; we'll contact you.
          </p>
          <p className="notice__ref">Order {orderId}</p>
          <Link href="/" className="btn btn--cta">
            <CtaShape />
            Back to the shop
          </Link>
        </section>
      )

    case 'missing':
      return (
        <section className="notice">
          <h1>Order not found.</h1>
          <Link href="/checkout" className="btn btn--cta">
            <CtaShape />
            Back to bag
          </Link>
        </section>
      )

    default:
      // expired / released / cancelled / refunded
      return (
        <section className="notice">
          <h1>Reservation expired.</h1>
          <p>The payment wasn't completed in time, so the items went back on sale. Your bag is still saved.</p>
          <Link href="/checkout" className="btn btn--cta">
            <CtaShape />
            Try again
          </Link>
        </section>
      )
  }
}
