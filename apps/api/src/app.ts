import { getConnInfo } from '@hono/node-server/conninfo'
import {
  checkoutRequestSchema,
  syncRequestSchema,
  type CartLine,
  type CheckoutResponse,
  type InternalOrder,
  type OrderFeedResponse,
  type OrderStatus,
  type OrderStatusResponse,
  type StockResponse,
} from '@kskblnk/types'
import { Hono, type Context } from 'hono'
import { bearerAuth } from 'hono/bearer-auth'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { API_BASE_PATH, config, DEMO } from './config'
import { createPayment, verifyNotification, type DokuNotification } from './doku'
import {
  attachPayment,
  confirm,
  getReservation,
  getStock,
  normalizeLines,
  release,
  reserve,
  syncCatalog,
} from './inventory'
import { keys, redis } from './redis'
import { sweep } from './sweeper'

/** All routes below are served under /api (see API_BASE_PATH). */
export const app = new Hono().basePath(API_BASE_PATH)

app.use('/stock', cors({ origin: config.WEB_ORIGIN, allowMethods: ['GET'] }))
app.use('/checkout', cors({ origin: config.WEB_ORIGIN, allowMethods: ['POST'] }))
app.use('/checkout/*', cors({ origin: config.WEB_ORIGIN, allowMethods: ['GET'] }))

app.get('/health', async (c) => {
  const pong = await redis.ping().catch(() => null)
  return c.json({ ok: pong === 'PONG' }, pong === 'PONG' ? 200 : 503)
})

/* ------------------------------------------------------------------ stock */

app.get('/stock', async (c) => {
  const data = await getStock()
  // Put the API behind a CDN: s-maxage=2 means the origin sees ~1 request / 2s
  // per edge location no matter how many phones are polling.
  c.header('Cache-Control', 'public, max-age=1, s-maxage=2, stale-while-revalidate=10')
  return c.json({ ...data, shippingFee: config.SHIPPING_FEE, demo: DEMO } satisfies StockResponse)
})

/* --------------------------------------------------------------- checkout */

function clientIp(c: Context) {
  if (config.TRUST_PROXY) {
    const h =
      // On Vercel only Vercel's own headers are trustworthy: a client could send cf-connecting-ip itself.
      (process.env.VERCEL ? undefined : c.req.header('cf-connecting-ip')) ??
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
      c.req.header('x-real-ip')
    if (h) return h
  }
  try {
    return getConnInfo(c).remote.address ?? 'unknown'
  } catch {
    return 'unknown' // not running on @hono/node-server
  }
}

async function rateLimited(ip: string) {
  const minute = Math.floor(Date.now() / 60_000)
  const k = keys.rate(ip, minute)
  const [[, count]] = (await redis.multi().incr(k).expire(k, 70).exec()) as [[null, number]]
  return count > config.RATE_LIMIT_PER_MIN
}

const fail = (c: Context, status: 400 | 404 | 409 | 429 | 502, body: Extract<CheckoutResponse, { ok: false }>) =>
  c.json(body, status)

app.post('/checkout', bodyLimit({ maxSize: 8 * 1024 }), async (c) => {
  if (await rateLimited(clientIp(c))) {
    return fail(c, 429, { ok: false, code: 'RATE_LIMITED', message: 'Too many attempts, wait a minute.' })
  }

  const parsed = checkoutRequestSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return fail(c, 400, { ok: false, code: 'INVALID', message: first?.message })
  }
  const { shipping } = parsed.data

  const lines = normalizeLines(parsed.data.lines)

  // 1. Atomic, all-or-nothing stock hold in Redis. Losers stop here and never reach DOKU.
  const r = await reserve(lines)
  if (!r.ok) {
    return fail(c, r.code === 'UNAVAILABLE' ? 404 : 409, { ok: false, code: r.code, skus: r.skus })
  }

  const amount = r.lines.reduce((n, l) => n + l.item.price * l.qty, 0) + config.SHIPPING_FEE

  // 2. Hosted payment page (QRIS, e-wallets, virtual accounts, cards).
  try {
    const url =
      config.PAYMENTS_MODE === 'doku'
        ? (await createPayment({ orderId: r.id, lines: r.lines, shippingFee: config.SHIPPING_FEE, amount, shipping })).url
        : `${config.WEB_ORIGIN}/checkout?order=${r.id}`
    await attachPayment(r.id, { paymentUrl: url, amount, shipping })

    if (config.PAYMENTS_MODE === 'mock') {
      await confirm(r.id, lines, { email: shipping.email, paidAmount: String(amount), channel: 'MOCK' })
    }
    return c.json({ ok: true, url, orderId: r.id, payBefore: r.payBefore } satisfies CheckoutResponse)
  } catch (e) {
    console.error('[checkout] payment provider error', e)
    await release(r.id, lines, 'released')
    return fail(c, 502, { ok: false, code: 'PAYMENT_PROVIDER', message: 'Payment is temporarily unavailable, retry.' })
  }
})

/** The storefront polls this after the buyer comes back from DOKU. */
app.get('/checkout/:id', async (c) => {
  const resv = await getReservation(c.req.param('id'))
  c.header('Cache-Control', 'no-store')
  if (!resv && DEMO && /^KB[0-9A-Z]{16,28}$/.test(c.req.param('id'))) {
    // Demo memory is per serverless instance: this poll may hit an instance that never saw
    // the order. Demo checkouts are confirmed instantly (mock payments), so report it paid.
    return c.json({ status: 'sold', paymentUrl: null, payBefore: null, amount: null } satisfies OrderStatusResponse)
  }
  if (!resv) return c.json({ status: 'missing', paymentUrl: null, payBefore: null, amount: null } satisfies OrderStatusResponse, 404)
  return c.json({
    status: resv.status,
    paymentUrl: resv.status === 'held' && (resv.payBefore ?? 0) > Date.now() ? resv.paymentUrl : null,
    payBefore: resv.payBefore,
    amount: resv.amount,
  } satisfies OrderStatusResponse)
})

/* ---------------------------------------------------------- DOKU webhooks */

export async function fulfil(orderId: string, info: Record<string, string>) {
  const resv = await getReservation(orderId)
  if (!resv) {
    console.error(`[order] ${orderId} paid but unknown to the API (check DOKU back office)`)
    return
  }
  const result = await confirm(orderId, resv.items, info)
  if (result === 'reclaimed') console.warn(`[order] ${orderId} paid after its hold expired, units re-taken`)
  if (result === 'oversold') {
    // Paid after the hold expired AND the units went to someone else.
    // DOKU refunds depend on the payment channel: refund it from the DOKU back office.
    console.error(`[order] ${orderId} OVERSOLD: paid but no stock left, refund it in DOKU back office`)
  }
  return result
}

app.post(config.DOKU_NOTIFY_PATH, async (c) => {
  if (config.PAYMENTS_MODE !== 'doku') return c.text('doku disabled', 404)
  const raw = await c.req.text()
  const verified = verifyNotification((h) => c.req.header(h), raw)
  if (!verified) return c.text('bad signature', 401)

  // DOKU may deliver the same notification more than once.
  const seenKey = keys.webhookSeen(verified.requestId)
  if (!(await redis.set(seenKey, '1', 'EX', 7 * 86_400, 'NX'))) return c.json({ ok: true, duplicate: true })

  try {
    const n = JSON.parse(raw) as DokuNotification
    const orderId = n.order?.invoice_number
    // DOKU Checkout: only SUCCESS is final. FAILED is ignored on purpose, the buyer
    // can retry with another method on the same page until it expires.
    if (orderId && n.transaction?.status === 'SUCCESS') {
      const resv = await getReservation(orderId)
      const paid = Number(n.order?.amount ?? 0)
      if (resv?.amount && paid !== resv.amount) {
        console.error(`[order] ${orderId} amount mismatch: paid ${paid}, expected ${resv.amount}`)
      }
      await fulfil(orderId, {
        paidAmount: String(paid),
        channel: n.channel?.id ?? '',
        paidAt: n.transaction?.date ?? '',
        email: n.customer?.email ?? '',
      })
    }
  } catch (e) {
    await redis.del(seenKey) // let DOKU retry
    console.error('[doku] notification error', e)
    return c.text('error', 500)
  }
  return c.json({ ok: true })
})

/* --------------------------------------------------------------- internal */

const internal = new Hono()
internal.use('*', bearerAuth({ token: config.INTERNAL_SECRET }))

/** Called by the CMS on every product save + on CMS boot. */
internal.post('/sync', async (c) => {
  const parsed = syncRequestSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ ok: false, error: parsed.error.issues }, 400)
  await syncCatalog(parsed.data)
  return c.json({ ok: true, products: parsed.data.products.length })
})

/**
 * Runs one sweeper pass (expired holds -> DOKU status check -> release/confirm).
 * Locally the Node server runs it on a timer; on Vercel there is no long-running
 * process, so a scheduler must call this every ~10-60 s. The Redis lock in sweep()
 * keeps overlapping calls safe.
 */
internal.post('/sweep', async (c) => {
  await sweep()
  return c.json({ ok: true })
})

/** Live drop monitor: total / held / sold per SKU. */
internal.get('/inventory', async (c) => {
  const skus = await redis.smembers(keys.skus)
  const pipe = redis.pipeline()
  for (const s of skus) pipe.hmget(keys.sku(s), 'name', 'label', 'total', 'held', 'sold', 'active')
  const rows = ((await pipe.exec()) ?? []).map(([, v], i) => {
    const [name, label, total, held, sold, active] = v as (string | null)[]
    return {
      sku: skus[i],
      name,
      label,
      total: Number(total ?? 0),
      held: Number(held ?? 0),
      sold: Number(sold ?? 0),
      available: Math.max(0, Number(total ?? 0) - Number(held ?? 0)),
      active: active === '1',
    }
  })
  return c.json(rows.sort((a, b) => String(a.sku).localeCompare(String(b.sku))))
})

/** Loads full order rows (with product name / size / price per line) for a list of order ids. */
async function loadOrders(ids: string[]): Promise<InternalOrder[]> {
  const pipe = redis.pipeline()
  for (const id of ids) pipe.hgetall(keys.resv(id))
  const hashes = ((await pipe.exec()) ?? []).map(([, h]) => h as Record<string, string>)
  const parsed = hashes.map((r) => ({ r, items: JSON.parse(r.items ?? '[]') as CartLine[] }))

  const skus = [...new Set(parsed.flatMap((p) => p.items.map((l) => l.sku)))]
  const skuPipe = redis.pipeline()
  for (const s of skus) skuPipe.hmget(keys.sku(s), 'name', 'label', 'price')
  const catalog = new Map(
    ((await skuPipe.exec()) ?? []).map(([, v], i) => {
      const [name, label, price] = v as (string | null)[]
      return [skus[i]!, { name: name ?? null, label: label ?? null, price: price ? Number(price) : null }] as const
    }),
  )

  return parsed.map(({ r, items }, i) => ({
    id: ids[i]!,
    status: r.status as OrderStatus,
    amount: Number(r.amount ?? 0),
    paidAmount: Number(r.paidAmount ?? 0),
    channel: r.channel || null,
    items: items.map((l) => ({ sku: l.sku, qty: l.qty, ...(catalog.get(l.sku) ?? { name: null, label: null, price: null }) })),
    shipping: JSON.parse(r.shipping ?? 'null'),
    createdAt: Number(r.createdAt ?? 0),
    confirmedAt: Number(r.confirmedAt ?? 0),
  }))
}

/** Paid orders with shipping addresses, newest first. status "oversold" = refund needed. */
internal.get('/orders', async (c) => {
  const ids = await redis.lrange(keys.orders, 0, Number(c.req.query('limit') ?? 200) - 1)
  return c.json(await loadOrders(ids))
})

/**
 * Paid orders oldest first, for the CMS order import. `cursor` = how many orders the
 * caller already has. The list only grows at its head (LPUSH), so negative (tail-based)
 * indexes are stable even while orders keep arriving during a drop.
 */
internal.get('/orders/feed', async (c) => {
  const cursor = Math.max(0, Math.floor(Number(c.req.query('cursor') ?? 0)) || 0)
  const limit = Math.min(1000, Math.max(1, Math.floor(Number(c.req.query('limit') ?? 500)) || 500))
  const [[, total], [, newestFirst]] = (await redis
    .multi()
    .llen(keys.orders)
    .lrange(keys.orders, -(cursor + limit), -(cursor + 1))
    .exec()) as [[null, number], [null, string[]]]
  const ids = cursor >= total ? [] : newestFirst.reverse()
  const orders = await loadOrders(ids)
  return c.json({ orders, nextCursor: cursor + ids.length, total } satisfies OrderFeedResponse)
})

app.route('/internal', internal)

app.onError((e, c) => {
  if (e instanceof HTTPException) return e.getResponse() // e.g. 401 from bearerAuth
  console.error('[api]', e)
  return c.json({ ok: false, code: 'INVALID', message: 'Server error' }, 500)
})
