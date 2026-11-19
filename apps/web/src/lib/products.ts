import { fetchProducts } from '@kskblnk/sdk'
import { cache } from 'react'

const CMS_URL = process.env.CMS_URL ?? 'http://localhost:3001'

/** Product pages are re-generated at most every 5 min, or instantly when the CMS calls /api/revalidate. */
export const REVALIDATE_SECONDS = 300

/**
 * One CMS call per (re)generation, shared by every page rendered in it.
 * Visitors never trigger this: they get the static HTML from the CDN.
 */
export const getProducts = cache(() =>
  fetchProducts(CMS_URL, { next: { revalidate: REVALIDATE_SECONDS, tags: ['products'] } }),
)

export async function getProduct(slug: string) {
  return (await getProducts()).find((p) => p.slug === slug) ?? null
}
