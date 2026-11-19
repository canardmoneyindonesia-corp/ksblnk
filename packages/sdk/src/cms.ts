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

function absolute(base: string, url: string) {
  return url.startsWith('http') ? url : `${base}${url}`
}

function mapImage(base: string, m: CmsMedia | string | number): ProductImage | null {
  if (typeof m !== 'object' || !m?.url) return null
  return {
    url: absolute(base, m.url),
    alt: m.alt ?? '',
    width: m.width ?? 1200,
    height: m.height ?? 1500,
  }
}

export function mapCmsProduct(base: string, doc: CmsProduct): Product {
  return {
    id: String(doc.id),
    slug: doc.slug,
    name: doc.name,
    description: doc.description ?? '',
    price: Math.round(doc.price),
    dropAt: doc.dropAt ?? null,
    images: (doc.images ?? [])
      .map((m) => mapImage(base, m))
      .filter((m): m is ProductImage => m !== null),
    variants: (doc.variants ?? []).map((v) => ({ sku: v.sku, label: v.label })),
  }
}

/**
 * Fetches all published products from Payload. Throws on failure on purpose:
 * with ISR a failed regeneration keeps serving the last good page instead of
 * publishing an empty store.
 */
export async function fetchProducts(
  cmsUrl: string,
  init?: RequestInit & { next?: { revalidate?: number | false; tags?: string[] } },
): Promise<Product[]> {
  const base = cmsUrl.replace(/\/$/, '')
  const qs = new URLSearchParams({ depth: '1', limit: '200', sort: 'sortOrder' })
  const res = await fetch(`${base}/api/products?${qs}`, init)
  if (!res.ok) throw new Error(`CMS responded ${res.status}`)
  const json = (await res.json()) as { docs: CmsProduct[] }
  return json.docs.map((d) => mapCmsProduct(base, d))
}
