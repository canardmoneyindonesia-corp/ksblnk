import type { InternalOrder, OrderFeedResponse } from '@kskblnk/types'
import type { Payload } from 'payload'

/*
 * Order import: the CMS PULLS paid orders from the API (never the other way round),
 * so the checkout hot path does not depend on the CMS. A cursor stored in the
 * "order-sync" global remembers how many orders were already imported; if the CMS
 * is down during a drop it simply catches up on the next run.
 */

const API_URL = process.env.API_URL ?? 'http://localhost:4000'
const API_SECRET = process.env.API_INTERNAL_SECRET ?? ''
const PAGE = 500

export interface ImportResult {
  created: number
  cursor: number
  total: number
}

const toIso = (ms: number) => (ms > 0 ? new Date(ms).toISOString() : null)

function paymentStatus(s: string) {
  return s === 'sold' || s === 'oversold' || s === 'refunded' ? s : 'other'
}

export function toOrderDoc(o: InternalOrder) {
  return {
    orderId: o.id,
    fulfilmentStatus: o.status === 'oversold' ? 'refund_needed' : o.status === 'refunded' ? 'refunded' : 'processing',
    paymentStatus: paymentStatus(o.status),
    total: o.amount,
    paidAmount: o.paidAmount || null,
    channel: o.channel,
    placedAt: toIso(o.createdAt),
    paidAt: toIso(o.confirmedAt),
    items: o.items.map((l) => ({ sku: l.sku, qty: l.qty, name: l.name, label: l.label, price: l.price })),
    customerName: o.shipping?.name ?? null,
    phone: o.shipping?.phone ?? null,
    email: o.shipping?.email ?? null,
    address: o.shipping?.address ?? null,
    city: o.shipping?.city ?? null,
    province: o.shipping?.province ?? null,
    postalCode: o.shipping?.postalCode ?? null,
  } as const
}

async function fetchFeed(cursor: number): Promise<OrderFeedResponse> {
  const res = await fetch(`${API_URL}/internal/orders/feed?cursor=${cursor}&limit=${PAGE}`, {
    headers: { authorization: `Bearer ${API_SECRET}` },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`API ${res.status} ${await res.text()}`)
  return res.json()
}

async function run(payload: Payload): Promise<ImportResult> {
  const state = await payload.findGlobal({ slug: 'order-sync', overrideAccess: true })
  let cursor = Number(state.cursor ?? 0)
  let created = 0
  let total = 0

  for (let guard = 0; guard < 100; guard++) {
    const feed = await fetchFeed(cursor)
    total = feed.total
    if (feed.total < cursor) {
      // The API's Redis was reset: rescan from the start, existing orders are skipped below.
      payload.logger.warn(`[orders] API has ${feed.total} orders but cursor is ${cursor}: rescanning`)
      cursor = 0
      continue
    }
    if (!feed.orders.length) break

    const ids = feed.orders.map((o) => o.id)
    const existing = await payload.find({
      collection: 'orders',
      where: { orderId: { in: ids } },
      limit: ids.length,
      pagination: false,
      depth: 0,
      overrideAccess: true,
      select: { orderId: true },
    })
    const have = new Set(existing.docs.map((d) => d.orderId))

    for (const o of feed.orders) {
      if (have.has(o.id)) continue
      await payload.create({ collection: 'orders', data: toOrderDoc(o), overrideAccess: true })
      created++
    }

    cursor = feed.nextCursor
    await payload.updateGlobal({
      slug: 'order-sync',
      data: { cursor, lastImportAt: new Date().toISOString() },
      overrideAccess: true,
    })
    if (cursor >= feed.total) break
  }

  if (created) payload.logger.info(`[orders] imported ${created} new order(s)`)
  return { created, cursor, total }
}

let running: Promise<ImportResult> | null = null

/** Safe to call concurrently (timer + "Import now" button): runs share one import. */
export function importOrders(payload: Payload) {
  running ??= run(payload).finally(() => {
    running = null
  })
  return running
}

const TIMER = Symbol.for('kskblnk.orderImportTimer')

/** Imports on boot, then every ORDER_IMPORT_INTERVAL_SECONDS (default 30, 0 = off). */
export function startOrderImport(payload: Payload) {
  const seconds = Number(process.env.ORDER_IMPORT_INTERVAL_SECONDS ?? 30)
  const g = globalThis as Record<symbol, ReturnType<typeof setInterval> | undefined>
  if (!(seconds > 0) || g[TIMER]) return
  const tick = () =>
    importOrders(payload).catch((e) => payload.logger.warn(`[orders] import failed: ${(e as Error).message}`))
  setTimeout(tick, 3000)
  g[TIMER] = setInterval(tick, seconds * 1000)
  g[TIMER].unref?.()
}
