'use client'

import { Button, toast } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { CMS_BASE_PATH } from '../lib/base-path'

/** "Import now" above the Orders list: pulls new paid orders from the API without waiting for the timer. */
export function ImportOrdersButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function run() {
    setBusy(true)
    try {
      const res = await fetch(`${CMS_BASE_PATH}/api/orders/import`, { method: 'POST', credentials: 'include' })
      const body = (await res.json()) as { ok: boolean; created?: number; error?: string }
      if (!body.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      toast.success(body.created ? `Imported ${body.created} new order(s)` : 'No new orders')
      router.refresh()
    } catch (e) {
      toast.error(`Import failed: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--base)' }}>
      <Button buttonStyle="secondary" size="small" disabled={busy} onClick={run}>
        {busy ? 'Importing…' : 'Import new orders now'}
      </Button>
    </div>
  )
}
