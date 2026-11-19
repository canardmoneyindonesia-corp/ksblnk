export {}

/**
 * Drop simulation: N units, M buyers hammering /checkout at the same instant.
 * Proves there is no oversell and measures latency.
 *
 *   pnpm drop:sim                     # 50 units, 5000 buyers, 100 concurrent
 *   pnpm drop:sim -- 100 20000 200    # units buyers concurrency
 *
 * Runs its own API instance in-process (mock payments, no rate limit) against
 * the Redis in REDIS_URL, using a throwaway SKU that is deleted afterwards.
 */
process.env.PAYMENTS_MODE = 'mock'
process.env.RATE_LIMIT_PER_MIN = '1000000000'
process.env.INTERNAL_SECRET ??= 'drop-sim-secret'

const [units = 50, buyers = 5000, concurrency = 100] = process.argv.slice(2).map(Number)

const { serve } = await import('@hono/node-server')
const { app } = await import('../src/app')
const { redis, keys } = await import('../src/redis')
const { config, API_BASE_PATH } = await import('../src/config')

const BUYER = {
  name: 'Drop Sim',
  phone: '081234567890',
  email: 'sim@example.com',
  address: 'Jl. Simulasi No. 1, RT 01/RW 02',
  city: 'Jakarta Selatan',
  province: 'DKI Jakarta',
  postalCode: '12190',
}
const SKU = `SIM-${Date.now()}`
const PRODUCT = `sim-${Date.now()}`

const server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' })
await new Promise((r) => server.once('listening', r))
const port = (server.address() as { port: number }).port
const base = `http://127.0.0.1:${port}${API_BASE_PATH}`

await fetch(`${base}/internal/sync`, {
  method: 'POST',
  headers: { authorization: `Bearer ${config.INTERNAL_SECRET}`, 'content-type': 'application/json' },
  body: JSON.stringify({
    products: [
      {
        id: PRODUCT,
        slug: PRODUCT,
        name: 'Drop sim tee',
        price: 350000,
        image: null,
        dropAt: null,
        published: true,
        variants: [{ sku: SKU, label: 'M', stock: units }],
      },
    ],
  }),
}).then((r) => {
  if (!r.ok) throw new Error(`sync failed ${r.status}`)
})

console.log(`Drop: ${units} units, ${buyers} buyers, ${concurrency} concurrent connections`)

const latencies: number[] = []
const codes = new Map<string, number>()
const reservations: string[] = []
let next = 0
const t0 = performance.now()

async function worker() {
  while (next < buyers) {
    next++
    const s = performance.now()
    let k: string
    try {
      const res = await fetch(`${base}/checkout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lines: [{ sku: SKU, qty: 1 }], shipping: BUYER }),
      })
      const body = (await res.json()) as { ok: boolean; code?: string; orderId?: string }
      if (body.orderId) reservations.push(body.orderId)
      k = body.ok ? 'OK' : (body.code ?? String(res.status))
    } catch {
      k = 'NETWORK_ERROR' // client-side socket limit, not an API answer
    }
    latencies.push(performance.now() - s)
    codes.set(k, (codes.get(k) ?? 0) + 1)
  }
}
await Promise.all(Array.from({ length: concurrency }, worker))
const elapsed = (performance.now() - t0) / 1000

const inv = await redis.hgetall(keys.sku(SKU))
latencies.sort((a, b) => a - b)
const pct = (p: number) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))]!.toFixed(1)

console.log(`\nResults in ${elapsed.toFixed(2)}s (${Math.round(buyers / elapsed)} req/s on one process)`)
console.log('  responses :', Object.fromEntries(codes))
console.log(`  latency   : p50 ${pct(0.5)}ms  p95 ${pct(0.95)}ms  p99 ${pct(0.99)}ms`)
console.log(`  redis     : total=${inv.total} held=${inv.held} sold=${inv.sold}`)

const okCount = codes.get('OK') ?? 0
const pass = okCount === units && Number(inv.sold) === units && Number(inv.held) === units
console.log(pass ? '\nPASS: sold exactly the stock, no oversell.' : '\nFAIL: inventory mismatch!')

// cleanup
await redis.del(keys.sku(SKU), keys.productSkus(PRODUCT))
await redis.srem(keys.skus, SKU)
for (const id of reservations) {
  await redis.del(keys.resv(id))
  await redis.lrem(keys.orders, 0, id)
}
server.close()
await redis.quit()
process.exit(pass ? 0 : 1)
