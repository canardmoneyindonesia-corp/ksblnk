import type { SyncProduct, SyncRequest } from '@kskblnk/types'
import type { Payload } from 'payload'

/*
 * The CMS PUSHES to the API and the storefront; nothing ever pulls from the CMS
 * at request time. So the CMS can be small, slow or down during a drop and the
 * store keeps selling.
 */

const API_SECRET = process.env.API_INTERNAL_SECRET ?? ''
const WEB_SECRET = process.env.WEB_REVALIDATE_SECRET ?? ''
const PUBLIC_URL = (process.env.CMS_PUBLIC_URL || (process.env.VERCEL ? '' : 'http://localhost:3001')).replace(/\/$/, '')

/*
 * API_URL: on Vercel the `api` service binding (vercel.json), injected at runtime only,
 * so read it per call. Locally it comes from .env.
 */
export const apiUrl = (path: string) => new URL(path, process.env.API_URL ?? 'http://localhost:4000')

/** Public origin of this deployment on Vercel (production domain, else the preview URL). */
function vercelOrigin() {
  const host =
    process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? process.env.VERCEL_PROJECT_PRODUCTION_URL
      : (process.env.VERCEL_BRANCH_URL ?? process.env.VERCEL_URL)
  return host ? `https://${host}` : undefined
}

/*
 * The storefront is NOT a binding: web already binds to cms (to read products) and Vercel
 * rejects circular bindings. Revalidation goes over the public URL instead
 * (/api/revalidate is routed to web in vercel.json and checks the shared secret).
 */
const webUrl = (path: string) =>
  new URL(path, process.env.WEB_URL ?? vercelOrigin() ?? 'http://localhost:3000')

/** Lets the call through Vercel Deployment Protection on previews ("Protection Bypass for Automation"). */
function bypassHeaders(): Record<string, string> {
  const s = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  return s ? { 'x-vercel-protection-bypass': s } : {}
}

type Doc = Record<string, any>

function firstImageUrl(doc: Doc): string | null {
  const img = Array.isArray(doc.images) ? doc.images[0] : null
  const url: string | undefined = typeof img === 'object' ? img?.url : undefined
  if (!url) return null
  return url.startsWith('http') ? url : `${PUBLIC_URL}${url}`
}

export function toSyncProduct(doc: Doc): SyncProduct {
  return {
    id: String(doc.id),
    slug: doc.slug,
    name: doc.name,
    price: Math.round(Number(doc.price)), // whole rupiah
    image: firstImageUrl(doc),
    dropAt: doc.dropAt ?? null,
    published: Boolean(doc.published),
    variants: (doc.variants ?? []).map((v: Doc) => ({
      sku: v.sku,
      label: v.label,
      stock: Number(v.stock ?? 0),
    })),
  }
}

export async function pushToApi(body: SyncRequest, log: Payload['logger']) {
  try {
    const res = await fetch(apiUrl('api/internal/sync'), {
      method: 'POST',
      headers: { authorization: `Bearer ${API_SECRET}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
    log.info(`[sync] pushed ${body.products.length} product(s) to API`)
    return true
  } catch (e) {
    log.error(`[sync] API push failed (stock/prices NOT updated in the API): ${(e as Error).message}`)
    return false
  }
}

export async function revalidateWeb(log: Payload['logger']) {
  try {
    const res = await fetch(webUrl('api/revalidate'), {
      method: 'POST',
      headers: { 'x-revalidate-secret': WEB_SECRET, ...bypassHeaders() },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) throw new Error(String(res.status))
    log.info('[sync] storefront revalidated')
  } catch (e) {
    log.warn(`[sync] storefront revalidation failed: ${(e as Error).message}`)
  }
}

/** Pushes the whole catalog. Run on CMS boot and from the "sync-all" endpoint. */
export async function pushAll(payload: Payload) {
  const { docs } = await payload.find({
    collection: 'products',
    depth: 1,
    pagination: false,
    overrideAccess: true,
  })
  const ok = await pushToApi({ products: docs.map(toSyncProduct), removed: [] }, payload.logger)
  await revalidateWeb(payload.logger)
  return { ok, count: docs.length }
}
