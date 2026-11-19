import type { CollectionConfig, Field } from 'payload'
import { importOrders } from '../lib/orders'

const isAdmin = ({ req }: { req: { user?: unknown } }) => Boolean(req.user)

/**
 * Everything copied from the API is read-only here, in the admin UI AND the REST/GraphQL API:
 * the API (Redis) stays the source of truth for payments. The importer uses overrideAccess.
 */
const ro = (field: Field): Field =>
  ({
    ...field,
    admin: { ...(field.admin ?? {}), readOnly: true },
    ...('name' in field ? { access: { update: () => false } } : {}),
  }) as Field

/**
 * Normal flow, moved forward by staff: processing -> shipped -> delivered.
 * The last 3 are exceptions outside that flow (oversold refunds, cancellations).
 */
export const FULFILMENT_STATUSES = [
  { label: '1 · Ordered, processing', value: 'processing' },
  { label: '2 · Shipped, on the way', value: 'shipped' },
  { label: '3 · Delivered', value: 'delivered' },
  { label: 'Refund needed', value: 'refund_needed' },
  { label: 'Refunded', value: 'refunded' },
  { label: 'Cancelled', value: 'cancelled' },
] as const

const COURIERS = [
  'JNE',
  'J&T Express',
  'SiCepat',
  'AnterAja',
  'Pos Indonesia',
  'Ninja Xpress',
  'ID Express',
  'Lion Parcel',
  'SAP Express',
  'GoSend',
  'GrabExpress',
  'Other',
].map((c) => ({ label: c, value: c }))

const needsTracking = (status: unknown) => status === 'shipped' || status === 'delivered'

export const Orders: CollectionConfig = {
  slug: 'orders',
  admin: {
    useAsTitle: 'orderId',
    defaultColumns: ['orderId', 'fulfilmentStatus', 'customerName', 'city', 'total', 'trackingNumber', 'paidAt'],
    listSearchableFields: ['orderId', 'customerName', 'email', 'phone', 'trackingNumber'],
    description:
      'Paid orders, imported from the API every 30 s (and on CMS boot). Payment and address fields are read-only. Move each order through Ordered (processing) → Shipped (on the way) → Delivered, with the courier and tracking number. "Refund needed" = paid after the stock ran out: refund it in the DOKU back office, then mark it Refunded.',
    components: {
      beforeListTable: ['/components/ImportOrdersButton#ImportOrdersButton'],
    },
  },
  defaultSort: '-paidAt',
  access: {
    read: isAdmin,
    update: isAdmin,
    // Orders only come from the API import. Never deleted: the import cursor would not bring them back.
    create: () => false,
    delete: () => false,
  },
  fields: [
    ro({ name: 'orderId', label: 'Order ID', type: 'text', required: true, unique: true, index: true }),

    /* ---------------------------------------------------- fulfilment (editable) */
    {
      name: 'fulfilmentStatus',
      label: 'Fulfilment',
      type: 'select',
      required: true,
      defaultValue: 'processing',
      index: true,
      options: [...FULFILMENT_STATUSES],
      admin: {
        position: 'sidebar',
        description: 'Ordered (processing) → Shipped (on the way) → Delivered. Shipped needs the courier and shipping code (resi).',
      },
    },
    {
      name: 'courier',
      type: 'select',
      options: COURIERS,
      defaultValue: 'JNE',
      admin: { position: 'sidebar' },
      validate: (value: unknown, { siblingData }: { siblingData: Record<string, unknown> }) =>
        needsTracking(siblingData?.fulfilmentStatus) && !value ? 'Choose the courier before marking it shipped.' : true,
    },
    {
      name: 'trackingNumber',
      label: 'Shipping code (resi)',
      type: 'text',
      index: true,
      admin: {
        position: 'sidebar',
        description: 'The JNE (or other courier) tracking number. Required to mark the order Shipped.',
      },
      validate: (value: unknown, { siblingData }: { siblingData: Record<string, unknown> }) =>
        needsTracking(siblingData?.fulfilmentStatus) && !String(value ?? '').trim()
          ? 'Enter the shipping code (resi) before marking it shipped.'
          : true,
    },
    {
      name: 'shippedAt',
      type: 'date',
      admin: {
        position: 'sidebar',
        date: { pickerAppearance: 'dayAndTime', displayFormat: 'd MMM yyyy, HH:mm' },
        description: 'Set automatically when the status becomes Shipped.',
      },
    },
    {
      name: 'deliveredAt',
      type: 'date',
      admin: {
        position: 'sidebar',
        date: { pickerAppearance: 'dayAndTime', displayFormat: 'd MMM yyyy, HH:mm' },
        description: 'Set automatically when the status becomes Delivered.',
      },
    },
    { name: 'notes', label: 'Internal notes', type: 'textarea', admin: { position: 'sidebar' } },

    /* ----------------------------------------------------- from the API (read-only) */
    {
      type: 'row',
      fields: [
        ro({ name: 'total', label: 'Total (Rp)', type: 'number', admin: { width: '33%' } }),
        ro({ name: 'paidAmount', label: 'Paid (Rp)', type: 'number', admin: { width: '33%' } }),
        ro({ name: 'channel', label: 'Payment channel', type: 'text', admin: { width: '33%' } }),
      ],
    },
    {
      type: 'row',
      fields: [
        ro({
          name: 'paymentStatus',
          type: 'select',
          options: [
            { label: 'Paid', value: 'sold' },
            { label: 'Paid, oversold (refund)', value: 'oversold' },
            { label: 'Refunded', value: 'refunded' },
            { label: 'Other', value: 'other' },
          ],
          admin: { width: '33%' },
        }),
        ro({
          name: 'placedAt',
          type: 'date',
          admin: { width: '33%', date: { pickerAppearance: 'dayAndTime', displayFormat: 'd MMM yyyy, HH:mm:ss' } },
        }),
        ro({
          name: 'paidAt',
          type: 'date',
          index: true,
          admin: { width: '33%', date: { pickerAppearance: 'dayAndTime', displayFormat: 'd MMM yyyy, HH:mm:ss' } },
        }),
      ],
    },
    ro({
      name: 'items',
      type: 'array',
      labels: { singular: 'Item', plural: 'Items' },
      fields: [
        {
          type: 'row',
          fields: [
            ro({ name: 'name', type: 'text', admin: { width: '40%' } }),
            ro({ name: 'label', label: 'Size', type: 'text', admin: { width: '15%' } }),
            ro({ name: 'sku', label: 'SKU', type: 'text', admin: { width: '25%' } }),
            ro({ name: 'qty', type: 'number', admin: { width: '10%' } }),
            ro({ name: 'price', label: 'Unit (Rp)', type: 'number', admin: { width: '10%' } }),
          ],
        },
      ],
    }),
    {
      type: 'collapsible',
      label: 'Ship to',
      admin: { initCollapsed: false },
      fields: [
        {
          type: 'row',
          fields: [
            ro({ name: 'customerName', label: 'Name', type: 'text', admin: { width: '40%' } }),
            ro({ name: 'phone', type: 'text', admin: { width: '25%' } }),
            ro({ name: 'email', type: 'email', admin: { width: '35%' } }),
          ],
        },
        ro({ name: 'address', type: 'textarea' }),
        {
          type: 'row',
          fields: [
            ro({ name: 'city', type: 'text', admin: { width: '40%' } }),
            ro({ name: 'province', type: 'text', admin: { width: '40%' } }),
            ro({ name: 'postalCode', label: 'Postal code', type: 'text', admin: { width: '20%' } }),
          ],
        },
      ],
    },
  ],
  hooks: {
    beforeChange: [
      ({ data, originalDoc }) => {
        const now = new Date().toISOString()
        // Pasted resi often carry spaces or lowercase letters: store one canonical form for search.
        if (typeof data.trackingNumber === 'string')
          data.trackingNumber = data.trackingNumber.replace(/\s+/g, '').toUpperCase() || null
        if (data.fulfilmentStatus === 'shipped' && !data.shippedAt && !originalDoc?.shippedAt) data.shippedAt = now
        if (data.fulfilmentStatus === 'delivered') {
          if (!data.deliveredAt && !originalDoc?.deliveredAt) data.deliveredAt = now
          if (!data.shippedAt && !originalDoc?.shippedAt) data.shippedAt = now
        }
        return data
      },
    ],
  },
  endpoints: [
    {
      // POST /api/orders/import (logged in): pull new paid orders from the API right now.
      path: '/import',
      method: 'post',
      handler: async (req) => {
        if (!req.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        try {
          return Response.json({ ok: true, ...(await importOrders(req.payload)) })
        } catch (e) {
          return Response.json({ ok: false, error: (e as Error).message }, { status: 502 })
        }
      },
    },
  ],
}
