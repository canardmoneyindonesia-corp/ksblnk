'use client'

import type { StockMap } from '@kskblnk/types'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { api } from './api'

const POLL_MS = 4000

interface StockState {
  stock: StockMap
  ready: boolean
  /** Flat shipping fee in rupiah, from the API (single source of truth). */
  shippingFee: number
  /** The API runs in demo mode: in-memory stock, no real payment. */
  demo: boolean
  /** serverTime - clientTime, so drop countdowns don't depend on the phone's clock. */
  offset: number
  refresh: () => void
}

const Ctx = createContext<StockState>({
  stock: {},
  ready: false,
  shippingFee: 0,
  demo: false,
  offset: 0,
  refresh: () => {},
})

/**
 * Live availability, polled only while the tab is visible. The response is
 * CDN-cached for ~2s, so 50k phones polling cost the API almost nothing.
 */
export function StockProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Omit<StockState, 'refresh'>>({
    stock: {},
    ready: false,
    shippingFee: 0,
    demo: false,
    offset: 0,
  })
  const ctrl = useRef<AbortController | null>(null)

  const refresh = useCallback(() => {
    ctrl.current?.abort()
    const c = new AbortController()
    ctrl.current = c
    const sent = Date.now()
    api
      .getStock(c.signal)
      .then((r) => {
        const rtt = Date.now() - sent
        setState({
          stock: r.stock,
          ready: true,
          shippingFee: r.shippingFee ?? 0,
          demo: r.demo === true,
          offset: r.at - (sent + rtt / 2),
        })
      })
      .catch(() => {
        // API unreachable: keep last known stock. Checkout still enforces availability server-side.
      })
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') refresh()
    }, POLL_MS)
    const onVis = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVis)
      ctrl.current?.abort()
    }
  }, [refresh])

  return <Ctx.Provider value={{ ...state, refresh }}>{children}</Ctx.Provider>
}

export const useStock = () => useContext(Ctx)

/** undefined = unknown yet (render as available, never block a sale on a failed poll). */
export function useAvailable(skus: string[]): number | undefined {
  const { stock, ready } = useStock()
  if (!ready) return undefined
  const known = skus.filter((s) => s in stock)
  if (!known.length) return undefined
  return known.reduce((n, s) => n + (stock[s] ?? 0), 0)
}

/**
 * Ticks every second; returns ms left until `iso` in server time (<= 0 when live).
 * null until mounted, so the static HTML never contains a stale countdown.
 */
export function useCountdown(iso: string | null): number | null {
  const { offset } = useStock()
  const target = iso ? Date.parse(iso) : 0
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    if (!target) return
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [target])
  if (!target) return 0
  if (now === null) return null
  return target - (now + offset)
}
