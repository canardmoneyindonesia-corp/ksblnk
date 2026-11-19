import { fetchProducts } from '@kskblnk/sdk'
import type { Product } from '@kskblnk/types'
import { DEMO_PRODUCTS } from '@kskblnk/types/demo'
import { cache } from 'react'
import { isDemo } from './demo'

/** Product pages are re-generated at most every 5 min, or instantly when the CMS calls /api/revalidate. */
export const REVALIDATE_SECONDS = 300

const isBuild = process.env.NEXT_PHASE === 'phase-production-build'

/**
 * Where to read products from (Payload REST root, i.e. <cms>/cms/api):
 * - runtime on Vercel: CMS_URL is the service binding to the internal `cms` service.
 *   Bindings are injected at runtime only, so read it here, per call.
 * - `next build` on Vercel: bindings don't exist yet. CMS_BUILD_URL (optional, set by
 *   you, e.g. https://your-domain) lets the build pre-render from the live CMS.
 * - local dev: CMS_URL from .env, else http://localhost:3001.
 */
function cmsApiUrl(): URL | null {
  const base =
    process.env.CMS_URL ??
    (isBuild ? process.env.CMS_BUILD_URL : undefined) ??
    (process.env.VERCEL ? undefined : 'http://localhost:3001')
  return base ? new URL('cms/api/', base) : null
}

async function load(): Promise<Product[]> {
  if (isDemo()) return DEMO_PRODUCTS
  const url = cmsApiUrl()
  if (!url) {
    // Vercel build without CMS_BUILD_URL: pre-render empty pages; ISR and the CMS's
    // /api/revalidate call fill them in at runtime through the binding.
    console.warn('[products] no CMS reachable during build: pre-rendering without products')
    return []
  }
  try {
    return await fetchProducts(url, { next: { revalidate: REVALIDATE_SECONDS, tags: ['products'] } })
  } catch (e) {
    // At runtime, throwing keeps the last good ISR page. At build there is no last good
    // page (e.g. first deploy, CMS not live yet), so don't fail the whole build.
    if (!isBuild) throw e
    console.warn(`[products] CMS fetch failed during build, pre-rendering without products: ${(e as Error).message}`)
    return []
  }
}

/**
 * One CMS call per (re)generation, shared by every page rendered in it.
 * Visitors never trigger this: they get the static HTML from the CDN.
 */
export const getProducts = cache(load)

export async function getProduct(slug: string) {
  return (await getProducts()).find((p) => p.slug === slug) ?? null
}
