/** Local / self-hosted Node server: HTTP + sweeper timer. On Vercel, src/index.ts is used instead. */
import { serve } from '@hono/node-server'
import { app } from './app'
import { config } from './config'
import { redis } from './redis'
import { startSweeper } from './sweeper'

const stopSweeper = startSweeper()

const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(`[api] listening on :${info.port} (payments: ${config.PAYMENTS_MODE}${config.PAYMENTS_MODE === 'doku' ? ` ${config.DOKU_ENV}` : ''}, hold: ${config.HOLD_MINUTES}min, shipping: Rp ${config.SHIPPING_FEE})`)
})

function shutdown() {
  stopSweeper()
  server.close(() => {
    redis.quit().finally(() => process.exit(0))
  })
  setTimeout(() => process.exit(1), 10_000).unref()
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
