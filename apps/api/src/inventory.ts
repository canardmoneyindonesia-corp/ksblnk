import { randomBytes } from 'node:crypto'
import type { CartLine, OrderStatus, StockMap, SyncRequest } from '@kskblnk/types'
import { config } from './config'
import { keys, redis } from './redis'

export interface CatalogEntry {
  sku: string
  label: string
  productId: string
  name: string
  slug: string
  /** Whole rupiah. */
  price: number
  image: string | null
  dropAt: number | null
  active: boolean
}

export type ReservationStatus = OrderStatus

/**
 * Order / reservation id, also used as the DOKU invoice_number: uppercase
 * alphanumeric only and <= 30 chars (DOKU's limit when cards are enabled).
 * 16 random base-36 chars (~82 bits) make it unguessable, so it can be shown in URLs.
 */
export function newOrderId() {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const rnd = [...randomBytes(16)].map((b) => alphabet[b % 36]).join('')
  return `KB${Date.now().toString(36).toUpperCase()}${rnd}`
}

/* ---------------------------------------------------------------- catalog */

export async function syncCatalog(req: SyncRequest) {
  const multi = redis.multi()
  for (const p of req.products) {
    const oldSkus = await redis.smembers(keys.productSkus(p.id))
    const newSkus = new Set(p.variants.map((v) => v.sku))
    for (const v of p.variants) {
      multi.hset(keys.sku(v.sku), {
        // Only catalog fields + total. held / sold are owned by the API and never reset here.
        total: v.stock,
        label: v.label,
        productId: p.id,
        name: p.name,
        slug: p.slug,
        price: p.price,
        image: p.image ?? '',
        dropAt: p.dropAt ? Date.parse(p.dropAt) : '',
        active: p.published ? 1 : 0,
      })
      multi.sadd(keys.skus, v.sku)
    }
    for (const sku of oldSkus) if (!newSkus.has(sku)) multi.hset(keys.sku(sku), 'active', 0)
    multi.del(keys.productSkus(p.id))
    if (newSkus.size) multi.sadd(keys.productSkus(p.id), ...newSkus)
  }
  for (const id of req.removed) {
    const skus = await redis.smembers(keys.productSkus(id))
    for (const sku of skus) multi.hset(keys.sku(sku), 'active', 0)
  }
  await multi.exec()
  stockCache = null
}

async function getCatalog(skus: string[]): Promise<Map<string, CatalogEntry>> {
  const pipe = redis.pipeline()
  for (const sku of skus) pipe.hgetall(keys.sku(sku))
  const res = (await pipe.exec()) ?? []
  const out = new Map<string, CatalogEntry>()
  res.forEach(([err, h], i) => {
    const sku = skus[i]!
    const row = h as Record<string, string> | null
    if (err || !row || !row.name) return
    out.set(sku, {
      sku,
      label: row.label ?? '',
      productId: row.productId ?? '',
      name: row.name,
      slug: row.slug ?? '',
      price: Number(row.price),
      image: row.image || null,
      dropAt: row.dropAt ? Number(row.dropAt) : null,
      active: row.active === '1',
    })
  })
  return out
}

/* ------------------------------------------------------------------ stock */

/**
 * Hot path during a drop: every open product page polls this. A 1s in-process
 * cache plus CDN caching (see Cache-Control in app.ts) means Redis sees at most
 * ~1 read/second per API instance, whatever the traffic.
 */
let stockCache: { at: number; data: StockMap; inflight?: Promise<StockMap> } | null = null

export async function getStock(): Promise<{ stock: StockMap; at: number }> {
  const now = Date.now()
  if (stockCache && now - stockCache.at < 1000) return { stock: stockCache.data, at: stockCache.at }
  if (stockCache?.inflight) return { stock: await stockCache.inflight, at: stockCache.at }

  const inflight = (async () => {
    const skus = await redis.smembers(keys.skus)
    const pipe = redis.pipeline()
    for (const sku of skus) pipe.hmget(keys.sku(sku), 'total', 'held', 'active')
    const res = (await pipe.exec()) ?? []
    const data: StockMap = {}
    res.forEach(([err, v], i) => {
      if (err) return
      const [total, held, active] = v as (string | null)[]
      data[skus[i]!] = active === '1' ? Math.max(0, Number(total ?? 0) - Number(held ?? 0)) : 0
    })
    return data
  })()

  stockCache = { at: stockCache?.at ?? 0, data: stockCache?.data ?? {}, inflight }
  try {
    const data = await inflight
    stockCache = { at: Date.now(), data }
    return { stock: data, at: stockCache.at }
  } catch (e) {
    stockCache = null
    throw e
  }
}

/* ------------------------------------------------------------ reservation */

export type ReserveResult =
  | { ok: true; id: string; payBefore: number; lines: (CartLine & { item: CatalogEntry })[] }
  | { ok: false; code: 'SOLD_OUT' | 'UNAVAILABLE' | 'NOT_LIVE'; skus: string[] }

/** Merges duplicate SKUs so a cart cannot bypass the per-SKU limit. */
export function normalizeLines(lines: CartLine[]): CartLine[] {
  const m = new Map<string, number>()
  for (const l of lines) m.set(l.sku, (m.get(l.sku) ?? 0) + l.qty)
  return [...m].map(([sku, qty]) => ({ sku, qty }))
}

export async function reserve(lines: CartLine[]): Promise<ReserveResult> {
  const catalog = await getCatalog(lines.map((l) => l.sku))
  const now = Date.now()

  const unavailable = lines.filter((l) => !catalog.get(l.sku)?.active).map((l) => l.sku)
  if (unavailable.length) return { ok: false, code: 'UNAVAILABLE', skus: unavailable }

  const notLive = lines.filter((l) => (catalog.get(l.sku)!.dropAt ?? 0) > now).map((l) => l.sku)
  if (notLive.length) return { ok: false, code: 'NOT_LIVE', skus: notLive }

  const id = newOrderId()
  // The payment page closes at payBefore; the sweeper looks again after a grace period
  // so a payment notification that arrives a bit late still finds its stock held.
  const payBefore = now + config.HOLD_MINUTES * 60_000
  const expiresAt = payBefore + config.PAYMENT_GRACE_MINUTES * 60_000
  const items = JSON.stringify(lines)
  const short = await redis.reserve(
    2 + lines.length,
    keys.resv(id),
    keys.resvExpiry,
    ...lines.map((l) => keys.sku(l.sku)),
    id,
    expiresAt,
    items,
    now,
    ...lines.map((l) => l.qty),
  )
  if (short.length) {
    return { ok: false, code: 'SOLD_OUT', skus: short.map((i) => lines[i - 1]!.sku) }
  }
  stockCache = null
  await redis.hset(keys.resv(id), 'payBefore', payBefore)
  return { ok: true, id, payBefore, lines: lines.map((l) => ({ ...l, item: catalog.get(l.sku)! })) }
}

export async function getReservation(id: string) {
  const h = await redis.hgetall(keys.resv(id))
  if (!h.status) return null
  return {
    id,
    status: h.status as ReservationStatus,
    items: JSON.parse(h.items ?? '[]') as CartLine[],
    paymentUrl: h.paymentUrl || null,
    amount: h.amount ? Number(h.amount) : null,
    createdAt: Number(h.createdAt),
    payBefore: h.payBefore ? Number(h.payBefore) : null,
    expiresAt: Number(h.expiresAt),
  }
}

/** Stores what the buyer is paying for, the shipping address and the DOKU payment page URL. */
export async function attachPayment(id: string, data: { paymentUrl: string; amount: number; shipping: object }) {
  await redis.hset(keys.resv(id), {
    paymentUrl: data.paymentUrl,
    amount: data.amount,
    shipping: JSON.stringify(data.shipping),
  })
}

/** Look at this reservation again later (payment still pending at DOKU). */
export async function postponeExpiry(id: string, at: number) {
  await redis.zadd(keys.resvExpiry, at, id)
}

export async function release(
  id: string,
  items: CartLine[],
  status: Extract<ReservationStatus, 'released' | 'expired' | 'cancelled'>,
) {
  const r = await redis.release(
    2 + items.length,
    keys.resv(id),
    keys.resvExpiry,
    ...items.map((l) => keys.sku(l.sku)),
    id,
    status,
    ...items.map((l) => l.qty),
  )
  if (r === 'ok') stockCache = null
  return r
}

export async function confirm(id: string, items: CartLine[], order: Record<string, string>) {
  const r = await redis.confirm(
    2 + items.length,
    keys.resv(id),
    keys.resvExpiry,
    ...items.map((l) => keys.sku(l.sku)),
    id,
    ...items.map((l) => l.qty),
  )
  if (r === 'ok' || r === 'reclaimed' || r === 'oversold') {
    // Oversold orders are listed too: they were paid and must be refunded by hand.
    await redis.multi().hset(keys.resv(id), { ...order, confirmedAt: Date.now() }).lpush(keys.orders, id).exec()
  }
  return r as 'ok' | 'reclaimed' | 'oversold' | 'already'
}

export async function markPending(id: string) {
  return redis.markPending(2, keys.resv(id), keys.resvExpiry, id)
}

export async function markRefunded(id: string) {
  await redis.hset(keys.resv(id), 'status', 'refunded')
}

/** Reservations whose hold has run out, oldest first. */
export async function dueReservations(limit = 100) {
  return redis.zrangebyscore(keys.resvExpiry, '-inf', Date.now(), 'LIMIT', 0, limit)
}

export async function dropFromExpiry(id: string) {
  await redis.zrem(keys.resvExpiry, id)
}
