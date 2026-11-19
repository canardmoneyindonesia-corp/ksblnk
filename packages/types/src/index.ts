import { z } from 'zod'

/**
 * The store sells in Indonesian Rupiah only. Every amount in this codebase is a
 * whole number of rupiah (IDR has no minor unit in practice: Rp 350.000 = 350000).
 */
export const CURRENCY = 'IDR' as const

/** Hard limits shared by the storefront (UI) and the API (enforcement). */
export const LIMITS = {
  maxLines: 5,
} as const

export interface ProductImage {
  url: string
  alt: string
  width: number
  height: number
}

export interface Variant {
  /** Unique stock-keeping unit, e.g. "TEE-BLK-M". This is the inventory key. */
  sku: string
  /** What the customer picks, e.g. "M". */
  label: string
}

/** Public product shape used by the storefront. Never contains stock totals. */
export interface Product {
  id: string
  slug: string
  name: string
  description: string
  /** Whole rupiah. */
  price: number
  images: ProductImage[]
  variants: Variant[]
  /** ISO date. Before this instant the product shows a countdown and the API refuses checkout. */
  dropAt: string | null
}

/** sku -> units currently purchasable. Missing sku = unknown (treat as available, the API enforces). */
export type StockMap = Record<string, number>

export interface StockResponse {
  stock: StockMap
  /** Server time (ms) of the snapshot; also used to sync drop countdowns with server time. */
  at: number
  /** Flat shipping fee in rupiah added to every order (0 = free shipping). */
  shippingFee: number
}

/* ------------------------------------------------------------- shipping */

export const PROVINCES = [
  'Aceh', 'Sumatera Utara', 'Sumatera Barat', 'Riau', 'Kepulauan Riau', 'Jambi', 'Bengkulu',
  'Sumatera Selatan', 'Kepulauan Bangka Belitung', 'Lampung', 'Banten', 'DKI Jakarta', 'Jawa Barat',
  'Jawa Tengah', 'DI Yogyakarta', 'Jawa Timur', 'Bali', 'Nusa Tenggara Barat', 'Nusa Tenggara Timur',
  'Kalimantan Barat', 'Kalimantan Tengah', 'Kalimantan Selatan', 'Kalimantan Timur', 'Kalimantan Utara',
  'Sulawesi Utara', 'Gorontalo', 'Sulawesi Tengah', 'Sulawesi Barat', 'Sulawesi Selatan',
  'Sulawesi Tenggara', 'Maluku', 'Maluku Utara', 'Papua', 'Papua Barat', 'Papua Barat Daya',
  'Papua Selatan', 'Papua Tengah', 'Papua Pegunungan',
] as const

/** "0812-3456-789", "+62 812 3456 789", "812..." -> "628123456789" (the format DOKU expects). */
export function normalizeIdPhone(input: string) {
  let d = input.replace(/\D/g, '')
  if (d.startsWith('0')) d = `62${d.slice(1)}`
  else if (d.startsWith('8')) d = `62${d}`
  return d
}

export const shippingSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name').max(80),
  phone: z
    .string()
    .transform(normalizeIdPhone)
    .pipe(z.string().regex(/^628\d{7,12}$/, 'Enter a valid Indonesian mobile number (08…)')),
  email: z.email('Enter a valid email').max(120),
  address: z.string().trim().min(10, 'Street, number, RT/RW, kelurahan, kecamatan').max(300),
  city: z.string().trim().min(2, 'Enter your city / kabupaten').max(80),
  province: z.enum(PROVINCES, 'Choose a province'),
  postalCode: z.string().trim().regex(/^\d{5}$/, 'Postal code is 5 digits'),
})
export type Shipping = z.infer<typeof shippingSchema>
export type ShippingInput = z.input<typeof shippingSchema>

/* ------------------------------------------------------------- checkout */

export const cartLineSchema = z.object({
  sku: z.string().min(1).max(64),
  qty: z.number().int().min(1),
})
export type CartLine = z.infer<typeof cartLineSchema>

export const checkoutRequestSchema = z.object({
  lines: z.array(cartLineSchema).min(1).max(LIMITS.maxLines),
  shipping: shippingSchema,
})
export type CheckoutRequest = z.input<typeof checkoutRequestSchema>

export type CheckoutErrorCode =
  | 'SOLD_OUT'
  | 'UNAVAILABLE'
  | 'NOT_LIVE'
  | 'RATE_LIMITED'
  | 'INVALID'
  | 'PAYMENT_PROVIDER'

export type CheckoutResponse =
  | { ok: true; url: string; orderId: string; payBefore: number }
  | { ok: false; code: CheckoutErrorCode; skus?: string[]; message?: string }

/**
 * held            stock reserved, DOKU payment page open
 * pending_payment (unused by DOKU, kept for other providers)
 * sold            paid
 * expired         not paid in time, stock back on sale
 * oversold        paid after expiry and someone else got the units: refund needed
 */
export type OrderStatus =
  | 'held'
  | 'pending_payment'
  | 'sold'
  | 'released'
  | 'expired'
  | 'cancelled'
  | 'oversold'
  | 'refunded'

export interface OrderStatusResponse {
  status: OrderStatus | 'missing'
  /** Only while status is "held": where the buyer can finish paying. */
  paymentUrl: string | null
  payBefore: number | null
  amount: number | null
}

/* ------------------------------------------------------------ CMS -> API */

/**
 * Payload pushed by the CMS to the API whenever a product changes.
 * `stock` is the TOTAL allocation for the drop (not "remaining"): the API keeps
 * held/sold counters itself, so re-syncing never resets sales.
 */
export const syncProductSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  price: z.number().int().nonnegative(),
  image: z.string().nullable(),
  dropAt: z.string().nullable(),
  published: z.boolean(),
  variants: z.array(
    z.object({
      sku: z.string().min(1).max(64),
      label: z.string(),
      stock: z.number().int().nonnegative(),
    }),
  ),
})
export type SyncProduct = z.infer<typeof syncProductSchema>

export const syncRequestSchema = z.object({
  products: z.array(syncProductSchema),
  /** Product ids that were deleted and must become unpurchasable. */
  removed: z.array(z.string()).default([]),
})
export type SyncRequest = z.infer<typeof syncRequestSchema>

/* ------------------------------------------------------- API -> CMS orders */

/** One order line as exported to the CMS (catalog fields copied at import time). */
export interface InternalOrderLine {
  sku: string
  qty: number
  name: string | null
  label: string | null
  /** Whole rupiah, unit price. */
  price: number | null
}

/** A paid order (status "sold") or a paid order that needs a refund ("oversold" / "refunded"). */
export interface InternalOrder {
  id: string
  status: OrderStatus
  /** Whole rupiah the buyer was asked to pay (items + shipping). */
  amount: number
  paidAmount: number
  channel: string | null
  items: InternalOrderLine[]
  shipping: Shipping | null
  /** ms epoch: checkout started. */
  createdAt: number
  /** ms epoch: payment confirmed. */
  confirmedAt: number
}

/**
 * GET /internal/orders/feed?cursor=N — paid orders oldest first.
 * `cursor` counts orders already consumed; pass `nextCursor` back to continue.
 * If `total` is below the cursor you sent, the API's Redis was reset: start again from 0.
 */
export interface OrderFeedResponse {
  orders: InternalOrder[]
  nextCursor: number
  total: number
}
