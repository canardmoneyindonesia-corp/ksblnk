/**
 * Demo catalog, used when the store runs without a database (see "Demo mode" in the README):
 * the storefront renders these products instead of reading the CMS, and the API seeds its
 * in-memory inventory from the same file. Edit demo-catalog.json to change what the demo sells.
 * Photos live in apps/web/public/demo/.
 */
import type { Product, SyncRequest, Variant } from './index'
import raw from './demo-catalog.json'

export interface DemoProduct extends Omit<Product, 'variants'> {
  /** `stock` = units on sale when the demo starts (the API's `total`). */
  variants: (Variant & { stock: number })[]
}

export const DEMO_CATALOG = raw.products as DemoProduct[]

/** What the storefront renders (no stock numbers: those come live from the API, like in production). */
export const DEMO_PRODUCTS: Product[] = DEMO_CATALOG.map(({ variants, ...p }) => ({
  ...p,
  variants: variants.map(({ sku, label, detail }) => ({ sku, label, ...(detail ? { detail } : {}) })),
}))

/** What the API loads, in the same shape the CMS pushes to POST /internal/sync. */
export const DEMO_SYNC: SyncRequest = {
  products: DEMO_CATALOG.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    price: p.price,
    image: p.images[0]?.url ?? null,
    dropAt: p.dropAt,
    published: true,
    variants: p.variants,
  })),
  removed: [],
}
