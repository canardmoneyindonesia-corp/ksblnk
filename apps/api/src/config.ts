import { z } from 'zod'

try {
  process.loadEnvFile()
} catch {
  // no .env file: rely on the real environment (production)
}

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  REDIS_URL: z.string().default('redis://localhost:6380'),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  INTERNAL_SECRET: z.string().min(8),

  PAYMENTS_MODE: z.enum(['mock', 'doku']).default('mock'),
  DOKU_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  DOKU_CLIENT_ID: z.string().default(''),
  DOKU_SECRET_KEY: z.string().default(''),
  /** Path part of the Notification URL set in the DOKU back office (it is part of the signature). */
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
  TRUST_PROXY: z
    .string()
    .default('0')
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
