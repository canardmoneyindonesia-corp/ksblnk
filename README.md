# KSKBLNK — drop merch store

A mobile-first store with 3 pages: a 2-column product grid, a product page and the bag/checkout page. It is built for small drops that sell out in minutes.

It sells **in Indonesian Rupiah only**, through **DOKU Checkout** (QRIS, GoPay / OVO / DANA / ShopeePay, bank virtual accounts, cards). Every amount in the code is a whole number of rupiah: `350000` is Rp 350.000.

```
apps/web   Next.js storefront: static/ISR pages behind a CDN               :3000
apps/cms   Payload CMS (products, photos, stock totals, order fulfilment). Not on the hot path :3001
apps/api   Hono + Redis: live stock, checkout, DOKU payments + notifications :4000
packages/  types (shared + zod schemas) · sdk (API/CMS clients) · ui
```

## How it handles a drop

| Concern | How |
|---|---|
| Thousands of phones on product pages | All 3 pages are pre-rendered HTML served by the CDN. A visitor never reaches the CMS or a server render. |
| Live "sold out / last 3" | `GET /stock` is cached for 1 s in the API process and 2 s on the CDN (`s-maxage=2`). Phones poll every 4 s, but only while the tab is visible. |
| Overselling | Each checkout runs one atomic Redis Lua script that holds all its lines or none of them. Tested: 5,000 simultaneous buyers for 50 units → exactly 50 sales (`pnpm drop:sim`). |
| Payment gateway load | Only buyers who already won stock in Redis reach DOKU, so DOKU traffic is capped by the number of units, not by the size of the crowd. Everyone else gets `SOLD_OUT` in a few ms. |
| Abandoned carts | A hold lasts `HOLD_MINUTES` (10 by default), and the DOKU payment page is created with that same lifetime. DOKU has no "cancel payment" call, so after a short grace period the sweeper asks DOKU's Check Status API: paid → confirm, expired → units back on sale, still pending → check again each minute, release after `PAYMENT_MAX_WAIT_MINUTES`. |
| Payment lands after the hold expired | The API takes the units again if they are still free. If someone else got them, the order is flagged `oversold` in `/internal/orders` and must be **refunded from the DOKU back office**, because DOKU refunds depend on the channel. |
| Lost notifications | Notifications are signature-checked (HMAC-SHA256) and de-duplicated. The sweeper's status check also confirms paid orders whose notification never arrived. |
| Bots / refreshing | 10 checkout attempts per IP per minute. Max 2 per size and 5 lines per order. The API refuses checkout before `dropAt`. |
| CMS down during a drop | The store keeps selling. The CMS pushes changes to the API and the storefront and is never read at request time. It re-syncs everything when it boots. |

Stock model (per SKU in Redis): `total` (set in the CMS), `held` (in an open checkout or sold), `sold`. Available = `total - held`. Raising the stock in the CMS restocks without resetting sales.

## Local dev

Requires Node 24 (Payload asks for ≥ 24.22), pnpm and Docker.

```bash
pnpm install
pnpm infra:up          # Postgres :55432, Redis :6380 (non-default ports on purpose)
pnpm dev               # web :3000, cms :3001, api :4000
pnpm seed              # once the CMS is up: admin + 6 demo products
pnpm drop:sim          # oversell / load test (args: units buyers concurrency)
```

- CMS admin: http://localhost:3001/cms/admin (the CMS is served under `/cms`, see [Vercel](#deploying-on-vercel)). Login `admin@kskblnk.local` / `kskblnk-admin` (change it).
- Payments start in `PAYMENTS_MODE=mock`, where a checkout is confirmed instantly. To use DOKU, set these in `apps/api/.env`: `PAYMENTS_MODE=doku`, `DOKU_ENV=sandbox`, `DOKU_CLIENT_ID` and `DOKU_SECRET_KEY` (DOKU back office → Integration → API Keys). DOKU must be able to reach your notification URL, so expose the API with a tunnel (e.g. `cloudflared tunnel --url http://localhost:4000`) and set `https://<tunnel>/api/webhooks/doku` as the Notification URL in the back office.
- Shipping is a flat fee: `SHIPPING_FEE` in `apps/api/.env` (rupiah, `0` = free). The storefront reads it from the API.
- Drop times are entered in WIB / WITA / WIT in the CMS.
- Live drop monitor: `curl -H "authorization: Bearer $INTERNAL_SECRET" localhost:4000/api/internal/inventory`. Paid orders with shipping addresses: `/api/internal/orders`.
- **Orders / fulfilment**: CMS admin → Orders. The CMS pulls new paid orders from the API (`/api/internal/orders/feed`, cursor-based) on boot and every `ORDER_IMPORT_INTERVAL_SECONDS` (30 by default), or on demand with "Import new orders now". Payment and address fields are read-only; staff move each order through 3 statuses: **Ordered** (processing) → **Shipped** (on the way) → **Delivered**. Shipped requires the courier (JNE by default) and the shipping code (resi), and stamps the date; Delivered stamps its date too. Oversold orders arrive as "Refund needed". If the CMS is down during a drop it catches up on the next import.

## Deploying on Vercel

`vercel.json` deploys the three apps as **one Vercel project with services**, on one domain:

| Path | Service | Notes |
|---|---|---|
| `/api/*` | `api` (Hono, `apps/api/src/index.ts`) | Every API route lives under `/api` (also locally: `localhost:4000/api/...`). |
| `/cms/*` | `cms` (Payload / Next, `basePath: '/cms'`) | Admin at `/cms/admin`, REST at `/cms/api`. |
| `/api/revalidate` | `web` | Matched before `/api/*`. Secret-protected; the CMS calls it over the public URL. |
| everything else | `web` (Next storefront) | |

Service bindings (Vercel injects these at runtime; don't set them yourself): `cms` gets `API_URL`, `web` gets `CMS_URL`. There is no `cms -> web` binding because Vercel rejects circular bindings; the CMS reaches the storefront's revalidate route on the public URL (`WEB_URL` if set, else the deployment's own URL; on protected previews enable "Protection Bypass for Automation"). They don't exist during builds, so the storefront build pre-renders from `CMS_BUILD_URL` if you set it (your public domain), otherwise it builds empty pages that ISR fills in. Leave `NEXT_PUBLIC_API_URL` unset on Vercel (defaults to `/api`).

There is no long-running process on Vercel, so the timers that run locally don't run there: the API sweeper (`POST /api/internal/sweep`, bearer `INTERNAL_SECRET`) and the CMS order import must be triggered by a scheduler. Run `vercel dev` to try all three services together locally.

## Production checklist

1. **web**: deploy to Vercel or another host with ISR and a CDN. Set `CMS_URL`, `NEXT_PUBLIC_API_URL` and `REVALIDATE_SECRET`. Add your media domain to `images.remotePatterns`.
2. **api**: run 2 or more instances (Fly.io, Railway, Render…) behind a CDN such as Cloudflare. Cache `/stock` there and never cache `/checkout`. Set `TRUST_PROXY=1`.
3. **Redis**: use a managed Redis with persistence (AOF) — Upstash, Redis Cloud or Elasticache. It holds the inventory.
4. **cms**: one small instance plus managed Postgres (Neon or Supabase). Add `@payloadcms/storage-s3` (S3 or R2) for photos. Run `payload migrate:create` before the first deploy (dev uses schema push).
5. **DOKU**: switch to `DOKU_ENV=production` with production keys. Set the Notification URL to `https://<domain>/api/webhooks/doku` (if you change the path, change `DOKU_NOTIFY_PATH` too, because it is part of the signature). Ask DOKU support to **enable the Check Status API** on your account: the sweeper relies on it. Optionally restrict methods with `DOKU_PAYMENT_METHODS` (e.g. QRIS and e-wallets only, for instant confirmation during drops).
6. **Before each drop**: publish the products with `dropAt` set (the storefront shows a countdown) and check `/internal/inventory`. Optionally add Cloudflare Turnstile or a waiting room in front of `/checkout` if bots become a problem.
