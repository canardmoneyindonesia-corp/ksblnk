'use client'

import { LIMITS, type CartLine } from '@kskblnk/types'
import { useSyncExternalStore } from 'react'

/** Bag lives in localStorage only: zero server calls until the buyer hits "Pay". */
const KEY = 'kskblnk.cart.v1'
const EMPTY: CartLine[] = []

let lines: CartLine[] | null = null
const listeners = new Set<() => void>()

function load(): CartLine[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(raw) ? raw.filter((l) => typeof l?.sku === 'string' && l.qty > 0) : []
  } catch {
    return []
  }
}

function save(next: CartLine[]) {
  lines = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // private mode / quota: keep in memory
  }
  listeners.forEach((l) => l())
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      lines = load()
      cb()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(cb)
    window.removeEventListener('storage', onStorage)
  }
}

const snapshot = () => (lines ??= load())

export function useCart() {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY)
}

export type AddResult = 'added' | 'max' | 'bag-full'

export const cart = {
  /**
   * Adds `qty` units, never above `max` (live stock left for this sku, when known).
   * Says why nothing was added so the UI can tell the buyer instead of failing silently.
   */
  add(sku: string, qty = 1, max = Infinity): AddResult {
    const cap = max
    const cur = snapshot()
    const existing = cur.find((l) => l.sku === sku)
    if (existing) {
      if (existing.qty >= cap) return 'max'
      cart.set(sku, Math.min(existing.qty + qty, cap))
      return 'added'
    }
    if (cap < 1) return 'max'
    if (cur.length >= LIMITS.maxLines) return 'bag-full'
    save([...cur, { sku, qty: Math.min(qty, cap) }])
    return 'added'
  },
  set(sku: string, qty: number) {
    const clamped = Math.max(0, qty)
    save(
      clamped === 0
        ? snapshot().filter((l) => l.sku !== sku)
        : snapshot().map((l) => (l.sku === sku ? { ...l, qty: clamped } : l)),
    )
    return true
  },
  /**
   * Swaps a line to another size of the same product, keeping its place in the bag.
   * If that size is already in the bag the two lines merge. Never above `max`
   * (live stock of the new size, when known).
   */
  changeSku(from: string, to: string, max = Infinity) {
    if (from === to || max < 1) return
    const cur = snapshot()
    const src = cur.find((l) => l.sku === from)
    if (!src) return
    const dst = cur.find((l) => l.sku === to)
    save(
      dst
        ? cur
            .filter((l) => l.sku !== from)
            .map((l) => (l.sku === to ? { ...l, qty: Math.min(l.qty + src.qty, max) } : l))
        : cur.map((l) => (l.sku === from ? { sku: to, qty: Math.min(src.qty, max) } : l)),
    )
  },
  remove(skus: string[]) {
    save(snapshot().filter((l) => !skus.includes(l.sku)))
  },
  clear() {
    save([])
  },
}

export const cartCount = (l: CartLine[]) => l.reduce((n, x) => n + x.qty, 0)
