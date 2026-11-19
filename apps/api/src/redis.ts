import { Redis } from 'ioredis'
import { config } from './config'

/**
 * Every key shares the `{shop}` hash tag so the multi-key Lua scripts below
 * stay valid on Redis Cluster / managed Redis that shards by slot.
 */
export const keys = {
  sku: (sku: string) => `{shop}:sku:${sku}`,
  skus: '{shop}:skus',
  productSkus: (productId: string) => `{shop}:product:${productId}:skus`,
  resv: (id: string) => `{shop}:resv:${id}`,
  resvExpiry: '{shop}:resv:expiry',
  orders: '{shop}:orders',
  webhookSeen: (requestId: string) => `{shop}:wh:${requestId}`,
  rate: (ip: string, minute: number) => `{shop}:rl:${ip}:${minute}`,
  sweeperLock: '{shop}:sweeper:lock',
}

/*
 * Inventory model, one hash per SKU:
 *   total  - units allocated to the drop (set by the CMS, safe to change any time)
 *   held   - units in an open checkout OR already sold
 *   sold   - units paid (reporting only)
 *   available = total - held
 *
 * All transitions are single Lua scripts, so they are atomic: under any
 * concurrency, held can never exceed total and nothing is sold twice.
 */

/** KEYS: resv, expiryZset, sku1..skuN   ARGV: resvId, expiresAt, itemsJson, createdAt, qty1..qtyN
 *  Returns {} on success or the 1-based indexes of the lines that are short. All-or-nothing. */
const RESERVE = `
local n = #KEYS - 2
local short = {}
for i = 1, n do
  local k = KEYS[i + 2]
  local total = tonumber(redis.call('HGET', k, 'total') or '-1')
  local held = tonumber(redis.call('HGET', k, 'held') or '0')
  if total < 0 or total - held < tonumber(ARGV[4 + i]) then
    table.insert(short, i)
  end
end
if #short > 0 then return short end
for i = 1, n do
  redis.call('HINCRBY', KEYS[i + 2], 'held', tonumber(ARGV[4 + i]))
end
redis.call('HSET', KEYS[1], 'status', 'held', 'items', ARGV[3], 'createdAt', ARGV[4], 'expiresAt', ARGV[2])
redis.call('ZADD', KEYS[2], ARGV[2], ARGV[1])
return {}
`

/** KEYS: resv, expiryZset, sku1..skuN   ARGV: resvId, newStatus, qty1..qtyN
 *  Gives units back only if the reservation is still open. Idempotent. */
const RELEASE = `
local st = redis.call('HGET', KEYS[1], 'status')
redis.call('ZREM', KEYS[2], ARGV[1])
if st ~= 'held' and st ~= 'pending_payment' then return st or 'missing' end
for i = 3, #KEYS do
  redis.call('HINCRBY', KEYS[i], 'held', -tonumber(ARGV[i]))
end
redis.call('HSET', KEYS[1], 'status', ARGV[2])
return 'ok'
`

/** KEYS: resv, expiryZset, sku1..skuN   ARGV: resvId, qty1..qtyN
 *  Marks a reservation as sold. If it had already been released (payment landed
 *  after the hold expired) it tries to re-take the units; if they are gone it
 *  returns 'oversold' so the caller refunds. Idempotent. */
const CONFIRM = `
local st = redis.call('HGET', KEYS[1], 'status')
if st == 'sold' or st == 'refunded' or st == 'oversold' then return 'already' end
redis.call('ZREM', KEYS[2], ARGV[1])
if st == 'held' or st == 'pending_payment' then
  for i = 3, #KEYS do redis.call('HINCRBY', KEYS[i], 'sold', tonumber(ARGV[i - 1])) end
  redis.call('HSET', KEYS[1], 'status', 'sold')
  return 'ok'
end
for i = 3, #KEYS do
  local total = tonumber(redis.call('HGET', KEYS[i], 'total') or '0')
  local held = tonumber(redis.call('HGET', KEYS[i], 'held') or '0')
  if total - held < tonumber(ARGV[i - 1]) then
    redis.call('HSET', KEYS[1], 'status', 'oversold')
    return 'oversold'
  end
end
for i = 3, #KEYS do
  redis.call('HINCRBY', KEYS[i], 'held', tonumber(ARGV[i - 1]))
  redis.call('HINCRBY', KEYS[i], 'sold', tonumber(ARGV[i - 1]))
end
redis.call('HSET', KEYS[1], 'status', 'sold')
return 'reclaimed'
`

/** KEYS: resv, expiryZset   ARGV: resvId — payment started but async (e.g. bank debit): stop the sweeper. */
const MARK_PENDING = `
local st = redis.call('HGET', KEYS[1], 'status')
if st ~= 'held' then return st or 'missing' end
redis.call('HSET', KEYS[1], 'status', 'pending_payment')
redis.call('ZREM', KEYS[2], ARGV[1])
return 'ok'
`

export interface ShopRedis extends Redis {
  reserve(...args: (string | number)[]): Promise<number[]>
  release(...args: (string | number)[]): Promise<string>
  confirm(...args: (string | number)[]): Promise<string>
  markPending(...args: (string | number)[]): Promise<string>
}

function create(): ShopRedis {
  const r = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: 2,
    enableAutoPipelining: true, // batches concurrent commands: big win under spikes
  }) as ShopRedis
  r.defineCommand('reserve', { lua: RESERVE })
  r.defineCommand('release', { lua: RELEASE })
  r.defineCommand('confirm', { lua: CONFIRM })
  r.defineCommand('markPending', { lua: MARK_PENDING })
  r.on('error', (e) => console.error('[redis]', e.message))
  return r
}

export const redis = create()
