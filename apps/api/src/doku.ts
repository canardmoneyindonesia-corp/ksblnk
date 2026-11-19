import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import type { Shipping } from '@kskblnk/types'
import { config } from './config'
import type { CatalogEntry } from './inventory'

/*
 * DOKU Checkout (non-SNAP) client.
 * Docs: https://developers.doku.com/accept-payments/doku-checkout/integration-guide/backend-integration
 *
 * Every request and every notification is signed:
 *   Signature: HMACSHA256=base64(hmacSha256(secretKey,
 *     "Client-Id:..\nRequest-Id:..\nRequest-Timestamp:..\nRequest-Target:<path>\nDigest:base64(sha256(body))"))
 * The Digest line is omitted for GET requests.
 */

const BASE = config.DOKU_ENV === 'production' ? 'https://api.doku.com' : 'https://api-sandbox.doku.com'

const digest = (body: string) => createHash('sha256').update(body, 'utf8').digest('base64')

export function sign(p: { clientId: string; requestId: string; timestamp: string; target: string; body?: string }) {
  const parts = [
    `Client-Id:${p.clientId}`,
    `Request-Id:${p.requestId}`,
    `Request-Timestamp:${p.timestamp}`,
    `Request-Target:${p.target}`,
  ]
  if (p.body !== undefined) parts.push(`Digest:${digest(p.body)}`)
  return `HMACSHA256=${createHmac('sha256', config.DOKU_SECRET_KEY).update(parts.join('\n'), 'utf8').digest('base64')}`
}

async function call<T>(method: 'GET' | 'POST', target: string, payload?: unknown): Promise<T> {
  const body = payload === undefined ? undefined : JSON.stringify(payload)
  const requestId = randomUUID()
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  const res = await fetch(`${BASE}${target}`, {
    method,
    headers: {
      'Client-Id': config.DOKU_CLIENT_ID,
      'Request-Id': requestId,
      'Request-Timestamp': timestamp,
      Signature: sign({ clientId: config.DOKU_CLIENT_ID, requestId, timestamp, target, body }),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body,
    signal: AbortSignal.timeout(10_000),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`DOKU ${method} ${target} -> ${res.status}: ${text.slice(0, 500)}`)
  return JSON.parse(text) as T
}

type Line = { sku: string; qty: number; item: CatalogEntry }

/**
 * Creates the DOKU-hosted payment page (QRIS, e-wallets, virtual accounts, cards...).
 * The page expires after HOLD_MINUTES, exactly when our stock hold ends.
 */
export async function createPayment(p: {
  orderId: string
  lines: Line[]
  shippingFee: number
  amount: number
  shipping: Shipping
}) {
  const s = p.shipping
  const [first, ...rest] = s.name.split(' ')
  const lineItems = p.lines.map((l) => ({
    id: l.sku,
    sku: l.sku,
    name: `${l.item.name} - ${l.item.label}`.slice(0, 255),
    price: l.item.price,
    quantity: l.qty,
    ...(l.item.image?.startsWith('https://') ? { image_url: l.item.image } : {}),
  }))
  if (p.shippingFee > 0) lineItems.push({ id: 'SHIPPING', sku: 'SHIPPING', name: 'Shipping', price: p.shippingFee, quantity: 1 })

  const back = `${config.WEB_ORIGIN}/checkout?order=${p.orderId}`
  const res = await call<{ response: { payment: { url: string; expired_date: string } } }>('POST', '/checkout/v1/payment', {
    order: {
      amount: p.amount, // must equal the sum of line_items
      invoice_number: p.orderId,
      currency: 'IDR',
      callback_url: back,
      callback_url_cancel: `${back}&cancelled=1`,
      callback_url_result: back,
      auto_redirect: true,
      // Never let DOKU extend an unpaid order past our stock hold.
      recover_abandoned_cart: false,
      line_items: lineItems,
    },
    payment: {
      payment_due_date: config.HOLD_MINUTES,
      ...(config.DOKU_PAYMENT_METHODS ? { payment_method_types: config.DOKU_PAYMENT_METHODS.split(',').map((m) => m.trim()) } : {}),
    },
    customer: {
      id: p.orderId,
      name: first,
      last_name: rest.join(' ') || undefined,
      email: s.email,
      phone: s.phone,
      address: s.address,
      city: s.city,
      state: s.province,
      postcode: s.postalCode,
      country: 'ID',
    },
    shipping_address: {
      first_name: first,
      last_name: rest.join(' ') || undefined,
      address: s.address,
      city: s.city,
      postal_code: s.postalCode,
      phone: s.phone,
      country_code: 'IDN',
    },
  })
  return { url: res.response.payment.url }
}

export type DokuStatus = 'paid' | 'expired' | 'pending'

/**
 * Check Status API. Note: DOKU support must enable it on existing merchant accounts.
 * Paid = transaction SUCCESS. Expired = order ORDER_EXPIRED. Anything else = still payable.
 */
export async function checkStatus(orderId: string): Promise<DokuStatus> {
  const r = await call<{ order?: { status?: string }; transaction?: { status?: string } }>(
    'GET',
    `/orders/v1/status/${encodeURIComponent(orderId)}`,
  )
  if (r.transaction?.status === 'SUCCESS') return 'paid'
  if (r.order?.status === 'ORDER_EXPIRED') return 'expired'
  return 'pending'
}

/** Verifies a DOKU HTTP notification. Request-Target is OUR notification path. */
export function verifyNotification(headers: (name: string) => string | undefined, rawBody: string) {
  const clientId = headers('client-id') ?? ''
  const requestId = headers('request-id') ?? ''
  const timestamp = headers('request-timestamp') ?? ''
  const got = headers('signature') ?? ''
  if (clientId !== config.DOKU_CLIENT_ID || !requestId || !got) return null
  const expected = sign({ clientId, requestId, timestamp, target: config.DOKU_NOTIFY_PATH, body: rawBody })
  const a = Buffer.from(got)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  return { requestId }
}

export interface DokuNotification {
  order?: { invoice_number?: string; amount?: number | string }
  transaction?: { status?: string; date?: string }
  channel?: { id?: string }
  customer?: { email?: string; name?: string }
}
