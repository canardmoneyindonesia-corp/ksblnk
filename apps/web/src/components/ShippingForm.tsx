'use client'

import { PROVINCES, type ShippingInput } from '@kskblnk/types'
import { useEffect, useState } from 'react'

const KEY = 'kskblnk.shipping.v1'

export const EMPTY_SHIPPING: ShippingInput = {
  name: '',
  phone: '',
  email: '',
  address: '',
  city: '',
  province: '' as ShippingInput['province'],
  postalCode: '',
}

/**
 * Address saved on the phone: fill it once before the drop, then checkout is one tap.
 * Uses standard autocomplete tokens so the phone can autofill everything.
 */
export function useSavedShipping() {
  const [value, setValue] = useState<ShippingInput>(EMPTY_SHIPPING)
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null')
      if (saved && typeof saved === 'object') setValue({ ...EMPTY_SHIPPING, ...saved })
    } catch {
      // ignore
    }
  }, [])
  const update = (patch: Partial<ShippingInput>) =>
    setValue((v) => {
      const next = { ...v, ...patch }
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        // private mode: keep in memory only
      }
      return next
    })
  return [value, update] as const
}

type Errors = Partial<Record<keyof ShippingInput, string>>

export function ShippingForm({
  value,
  onChange,
  errors,
}: {
  value: ShippingInput
  onChange: (patch: Partial<ShippingInput>) => void
  errors: Errors
}) {
  const field = (name: keyof ShippingInput) => ({
    id: `ship-${name}`,
    name,
    value: value[name] ?? '',
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': errors[name] ? `ship-${name}-err` : undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      onChange({ [name]: e.target.value } as Partial<ShippingInput>),
  })
  const err = (name: keyof ShippingInput) =>
    errors[name] ? (
      <span className="field__err" id={`ship-${name}-err`}>
        {errors[name]}
      </span>
    ) : null

  return (
    <div className="ship">
      <fieldset className="ship__group">
        <legend className="ship__title">Contact</legend>

        <label className="field">
          <span>Full name</span>
          <input {...field('name')} autoComplete="name" placeholder="As on your ID" />
          {err('name')}
        </label>

        <label className="field">
          <span>WhatsApp / phone</span>
          <input {...field('phone')} type="tel" inputMode="tel" autoComplete="tel" placeholder="0812 3456 7890" />
          {err('phone')}
        </label>

        <label className="field">
          <span>Email</span>
          <input {...field('email')} type="email" inputMode="email" autoComplete="email" placeholder="you@email.com" />
          {err('email')}
        </label>
        <p className="ship__hint">We send order updates by WhatsApp and email.</p>
      </fieldset>

      <fieldset className="ship__group">
        <legend className="ship__title">Delivery address</legend>

        <label className="field">
          <span>Street address</span>
          <textarea
            {...field('address')}
            rows={3}
            autoComplete="street-address"
            placeholder="Jl. …, No., RT/RW, kelurahan, kecamatan"
          />
          {err('address')}
        </label>

        <div className="field-row">
          <label className="field">
            <span>City / kabupaten</span>
            <input {...field('city')} autoComplete="address-level2" />
            {err('city')}
          </label>
          <label className="field field--postal">
            <span>Postal code</span>
            <input
              {...field('postalCode')}
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={5}
              placeholder="12345"
            />
            {err('postalCode')}
          </label>
        </div>

        <label className="field field--select">
          <span>Province</span>
          <select {...field('province')} autoComplete="address-level1" data-empty={value.province ? undefined : ''}>
            <option value="" disabled>
              Choose province
            </option>
            {PROVINCES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          {err('province')}
        </label>
        <p className="ship__hint">Saved on this phone, so next time checkout is one tap.</p>
      </fieldset>
    </div>
  )
}
