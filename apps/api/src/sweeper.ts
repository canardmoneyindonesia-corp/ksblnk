import { fulfil } from './app'
import { config } from './config'
import { checkStatus } from './doku'
import { dropFromExpiry, dueReservations, getReservation, postponeExpiry, release } from './inventory'
import { keys, redis } from './redis'

const EVERY_MS = 10_000

/**
 * Returns unpaid stock to the drop once a hold runs out.
 *
 * DOKU has no "cancel payment page" call, so the page is created with the same
 * lifetime as our hold (HOLD_MINUTES). After an extra grace period we ask DOKU:
 *   paid     -> confirm the sale (the notification was lost or late)
 *   expired  -> nobody can pay any more: units go back on sale
 *   pending  -> look again in a minute, up to PAYMENT_MAX_WAIT_MINUTES, then release.
 *               A payment landing after that is re-taken if stock remains,
 *               otherwise flagged "oversold" for a manual refund.
 *
 * Runs on every API instance; a Redis lock lets only one sweep at a time.
 */
export async function sweep() {
  const locked = await redis.set(keys.sweeperLock, process.pid, 'PX', EVERY_MS - 1000, 'NX')
  if (!locked) return

  for (const id of await dueReservations()) {
    const resv = await getReservation(id)
    if (!resv || resv.status !== 'held') {
      await dropFromExpiry(id)
      continue
    }
    if (config.PAYMENTS_MODE !== 'doku' || !resv.paymentUrl) {
      // No payment page was ever created (crash mid-checkout): nothing can be paid.
      await release(id, resv.items, 'expired')
      continue
    }

    let state: 'paid' | 'expired' | 'pending' | 'unknown'
    try {
      state = await checkStatus(id)
    } catch (e) {
      console.warn(`[sweeper] DOKU status check failed for ${id}: ${(e as Error).message}`)
      state = 'unknown'
    }

    const waitedTooLong = Date.now() > resv.createdAt + config.PAYMENT_MAX_WAIT_MINUTES * 60_000
    if (state === 'paid') await fulfil(id, { channel: 'status-check' })
    else if (state === 'expired' || waitedTooLong) await release(id, resv.items, 'expired')
    else await postponeExpiry(id, Date.now() + 60_000)
  }
}

export function startSweeper() {
  const t = setInterval(() => {
    sweep().catch((e) => console.error('[sweeper]', e))
  }, EVERY_MS)
  t.unref()
  return () => clearInterval(t)
}
