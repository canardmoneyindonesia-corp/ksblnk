import type {
  CartLine,
  CheckoutResponse,
  OrderStatusResponse,
  ShippingInput,
  StockResponse,
} from '@kskblnk/types'

/** Typed client for apps/api. Safe to use in the browser. */
export function createApiClient(baseUrl: string) {
  const base = baseUrl.replace(/\/$/, '')

  return {
    async getStock(signal?: AbortSignal): Promise<StockResponse> {
      const res = await fetch(`${base}/stock`, { signal })
      if (!res.ok) throw new Error(`stock ${res.status}`)
      return res.json()
    },

    async checkout(lines: CartLine[], shipping: ShippingInput): Promise<CheckoutResponse> {
      try {
        const res = await fetch(`${base}/checkout`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ lines, shipping }),
        })
        return (await res.json()) as CheckoutResponse
      } catch {
        return { ok: false, code: 'PAYMENT_PROVIDER', message: 'Network error, please retry.' }
      }
    },

    /** Status of an order after the buyer comes back from the DOKU payment page. */
    async getOrder(orderId: string, signal?: AbortSignal): Promise<OrderStatusResponse> {
      const res = await fetch(`${base}/checkout/${encodeURIComponent(orderId)}`, { signal, cache: 'no-store' })
      if (!res.ok) throw new Error(`order ${res.status}`)
      return res.json()
    },
  }
}

export type ApiClient = ReturnType<typeof createApiClient>
