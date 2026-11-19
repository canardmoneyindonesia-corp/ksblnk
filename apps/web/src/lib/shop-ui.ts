'use client'

import { useSyncExternalStore } from 'react'

/**
 * Tiny UI store shared by the home grid and the bag sheet:
 * which card has its size picker open, and whether the bottom bag sheet is open.
 */
let picker: string | null = null
let sheetOpen = false
let sheetMounted = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export const shopUi = {
  openPicker(id: string | null) {
    if (picker === id) return
    picker = id
    emit()
  },
  setSheet(open: boolean) {
    if (sheetOpen === open) return
    sheetOpen = open
    if (open) picker = null
    emit()
  },
  /** Called by the bag sheet on mount; closes it again when the buyer leaves the page. */
  mountSheet() {
    sheetMounted++
    return () => {
      sheetMounted--
      if (!sheetMounted) shopUi.setSheet(false)
    }
  },
}

export const useOpenPicker = () => useSyncExternalStore(subscribe, () => picker, () => null)
export const useSheetOpen = () => useSyncExternalStore(subscribe, () => sheetOpen, () => false)
