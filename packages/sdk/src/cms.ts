import type { Product, ProductImage } from '@kskblnk/types'

/** Loose shape of a Payload `products` document (REST, depth=1, public read). */
interface CmsMedia {
  url?: string | null
  alt?: string | null
  width?: number | null
  height?: number | null
}
interface CmsProduct {
  id: string | number
  slug: string
  name: string
  description?: string | null
  /** Whole rupiah, as entered in the CMS. */
  price: number
  dropAt?: string | null
  images?: (CmsMedia | string | number)[] | null
  variants?: { sku: string; label: string }[] | null
}

function mapImage(m: CmsMedia | string | number): ProductImage | null {
  if (typeof m !== 'object' || !m?.url) return null
  return {
    // Absolute when the CMS has a public serverURL (local dev: http://localhost:3001/cms/...).
    // Relative (/cms/api/media/file/...) when the CMS and storefront share one domain:
    // never prefix it with the CMS fetch base, which may be an internal service URL.
    url: m.url,
    alt: m.alt ?? '',
    width: m.width ?? 1200,
    height: m.height ?? 1500,
  }
}

export function mapCmsProduct(doc: CmsProduct): Product {
  return {
    id: String(doc.id),
    slug: doc.slug,
    name: doc.name,
    description: doc.description ?? '',
    price: Math.round(doc.price),
    dropAt: doc.dropAt ?? null,
    images: (doc.images ?? [])
      .map(mapImage)
      .filter((m): m is ProductImage => m !== null),
    variants: (doc.variants ?? []).map((v) => ({ sku: v.sku, label: v.label })),
  }
}

/**
 * Fetches all published products from Payload. Throws on failure on purpose:
 * with ISR a failed regeneration keeps serving the last good page instead of
 * publishing an empty store.
 *
 * `cmsApiUrl` is the Payload REST root, e.g. http://localhost:3001/cms/api.
 */
export async function fetchProducts(
  cmsApiUrl: string | URL,
  init?: RequestInit & { next?: { revalidate?: number | false; tags?: string[] } },
): Promise<Product[]> {
  const base = String(cmsApiUrl).replace(/\/$/, '')
  const qs = new URLSearchParams({ depth: '1', limit: '200', sort: 'sortOrder' })
  const res = await fetch(`${base}/products?${qs}`, init)
  if (!res.ok) throw new Error(`CMS responded ${res.status}`)
  const json = (await res.json()) as { docs: CmsProduct[] }
  return json.docs.map(mapCmsProduct)
}
