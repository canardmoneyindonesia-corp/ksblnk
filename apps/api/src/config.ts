import { z } from 'zod'

try {
  process.loadEnvFile()
} catch {
  // no .env file: rely on the real environment (production)
}

/**
 * Every API route lives under this prefix. On Vercel the top-level rewrite
 * `/api/(.*)` sends requests here with the path unchanged, so the app must
 * serve /api/stock, /api/checkout, ... (locally: http://localhost:4000/api/...).
 */
export const API_BASE_PATH = '/api'

const onVercel = Boolean(process.env.VERCEL)

/** Public storefront origin on Vercel: same domain as the API (production domain, else this deployment). */
function vercelOrigin() {
  const host =
    process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? process.env.VERCEL_PROJECT_PRODUCTION_URL
      : (process.env.VERCEL_BRANCH_URL ?? process.env.VERCEL_URL)
  return host ? `https://${host}` : undefined
}

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  REDIS_URL: z.string().default('redis://localhost:6380'),
  WEB_ORIGIN: z.string().default(vercelOrigin() ?? 'http://localhost:3000'),
  INTERNAL_SECRET: z.string().min(8),

  PAYMENTS_MODE: z.enum(['mock', 'doku']).default('mock'),
  DOKU_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  DOKU_CLIENT_ID: z.string().default(''),
  DOKU_SECRET_KEY: z.string().default(''),
  /**
   * Notification route, relative to API_BASE_PATH. The Notification URL in the DOKU back office
   * is https://<domain>/api/webhooks/doku, and API_BASE_PATH + this path is part of the signature.
   */
  DOKU_NOTIFY_PATH: z.string().default('/webhooks/doku'),
  /** Optional comma-separated list, e.g. "QRIS,EMONEY_SHOPEE_PAY,VIRTUAL_ACCOUNT_BCA". Empty = all enabled. */
  DOKU_PAYMENT_METHODS: z.string().default(''),

  /** Flat shipping fee in rupiah added to every order. 0 = free shipping. */
  SHIPPING_FEE: z.coerce.number().int().min(0).default(0),
  /** Stock hold AND DOKU payment page lifetime. Short = fairer drops. */
  HOLD_MINUTES: z.coerce.number().int().min(5).max(60).default(10),
  /** Extra wait after the hold for late DOKU notifications before units go back on sale. */
  PAYMENT_GRACE_MINUTES: z.coerce.number().int().min(1).max(60).default(3),
  /** Stop waiting for a "pending" payment after this long and release the units. */
  PAYMENT_MAX_WAIT_MINUTES: z.coerce.number().int().min(10).max(24 * 60).default(30),

  RATE_LIMIT_PER_MIN: z.coerce.number().min(1).default(10),
  /** Defaults to on when running on Vercel, which always sits in front of the function. */
  TRUST_PROXY: z
    .string()
    .default(onVercel ? '1' : '0')
    .transform((v) => v === '1' || v === 'true'),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  console.error('Invalid API environment:', z.treeifyError(parsed.error))
  process.exit(1)
}

export const config = parsed.data

if (config.PAYMENTS_MODE === 'doku' && (!config.DOKU_CLIENT_ID || !config.DOKU_SECRET_KEY)) {
  console.error('PAYMENTS_MODE=doku requires DOKU_CLIENT_ID and DOKU_SECRET_KEY')
  process.exit(1)
}
