import type { CollectionConfig } from 'payload'
import { pushAll, pushToApi, revalidateWeb, toSyncProduct } from '../lib/sync'

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

const isAdmin = ({ req }: { req: { user?: unknown } }) => Boolean(req.user)

export const Products: CollectionConfig = {
  slug: 'products',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'price', 'published', 'dropAt', 'sortOrder'],
    description:
      'Saving a product pushes price + stock to the API and refreshes the storefront. "Stock" is the TOTAL units for the drop: raising it restocks, sales already made are kept.',
  },
  defaultSort: 'sortOrder',
  access: {
    // Public (storefront build) only sees published products. Everything else requires login.
    read: ({ req }) => (req.user ? true : { published: { equals: true } }),
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: { position: 'sidebar', description: 'URL: /p/<slug>. Auto-filled from the name.' },
      hooks: {
        beforeValidate: [({ value, data }) => (value ? slugify(value) : data?.name ? slugify(data.name) : value)],
      },
    },
    {
      name: 'published',
      type: 'checkbox',
      defaultValue: false,
      admin: { position: 'sidebar', description: 'Visible on the store.' },
    },
    {
      name: 'dropAt',
      type: 'date',
      // Editors pick the drop time in Indonesian time, whatever their laptop's timezone.
      timezone: {
        defaultTimezone: 'Asia/Jakarta',
        supportedTimezones: [
          { label: 'WIB (Jakarta)', value: 'Asia/Jakarta' },
          { label: 'WITA (Bali, Makassar)', value: 'Asia/Makassar' },
          { label: 'WIT (Jayapura)', value: 'Asia/Jayapura' },
        ],
      },
      admin: {
        position: 'sidebar',
        date: { pickerAppearance: 'dayAndTime', displayFormat: 'd MMM yyyy, HH:mm' },
        description: 'Optional. Before this time the product shows a countdown and checkout stays closed.',
      },
    },
    { name: 'sortOrder', type: 'number', defaultValue: 0, admin: { position: 'sidebar' } },
    {
      name: 'price',
      label: 'Price (Rp)',
      type: 'number',
      required: true,
      min: 1000,
      admin: { description: 'Whole rupiah, no dots: 350000 = Rp 350.000', step: 1000 },
      validate: (v: number | null | undefined) =>
        v == null || Number.isInteger(v) ? true : 'Rupiah has no decimals: use a whole number.',
    },
    { name: 'description', type: 'textarea' },
    {
      name: 'images',
      type: 'upload',
      relationTo: 'media',
      hasMany: true,
      required: true,
      admin: { description: 'First image is the grid thumbnail. Portrait 4:5 recommended.' },
    },
    {
      name: 'variants',
      type: 'array',
      required: true,
      minRows: 1,
      labels: { singular: 'Size / variant', plural: 'Sizes / variants' },
      admin: { initCollapsed: false },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'label', type: 'text', required: true, admin: { width: '25%', placeholder: 'M' } },
            {
              name: 'sku',
              type: 'text',
              required: true,
              admin: { width: '45%', placeholder: 'TEE-BLK-M', description: 'Unique, never reuse.' },
            },
            {
              name: 'stock',
              type: 'number',
              required: true,
              min: 0,
              defaultValue: 0,
              // Stock totals never leave the CMS publicly; the storefront reads live availability from the API.
              access: { read: isAdmin },
              admin: { width: '30%' },
            },
          ],
        },
        {
          name: 'detail',
          label: 'Size detail',
          type: 'text',
          maxLength: 80,
          admin: {
            placeholder: 'Chest 53 · Length 71 cm',
            description: 'Optional. Shown under the size in the size picker. Empty = nothing shown.',
          },
        },
      ],
    },
  ],
  hooks: {
    beforeValidate: [
      async ({ data, req, originalDoc }) => {
        const skus: string[] = (data?.variants ?? []).map((v: { sku?: string }) => v.sku?.trim()).filter(Boolean)
        if (new Set(skus).size !== skus.length) throw new Error('Duplicate SKU inside this product.')
        if (!skus.length) return data
        const clash = await req.payload.find({
          collection: 'products',
          where: {
            and: [
              { 'variants.sku': { in: skus } },
              ...(originalDoc?.id ? [{ id: { not_equals: originalDoc.id } }] : []),
            ],
          },
          limit: 1,
          depth: 0,
          overrideAccess: true,
          req,
        })
        if (clash.docs.length) throw new Error(`SKU already used by "${clash.docs[0]!.name}".`)
        return data
      },
    ],
    afterChange: [
      async ({ doc, req }) => {
        const full = await req.payload.findByID({
          collection: 'products',
          id: doc.id,
          depth: 1,
          overrideAccess: true,
          req,
        })
        const body = { products: [toSyncProduct(full)], removed: [] }
        // Fire and forget: never block an editor's save on the API or storefront.
        // Small delay so the DB transaction is committed before the storefront refetches.
        setTimeout(() => {
          void pushToApi(body, req.payload.logger)
          void revalidateWeb(req.payload.logger)
        }, 500)
        return doc
      },
    ],
    afterDelete: [
      ({ doc, req }) => {
        setTimeout(() => {
          void pushToApi({ products: [], removed: [String(doc.id)] }, req.payload.logger)
          void revalidateWeb(req.payload.logger)
        }, 500)
      },
    ],
  },
  endpoints: [
    {
      // POST /api/products/sync-all (logged in): re-push the whole catalog, e.g. after an API outage.
      path: '/sync-all',
      method: 'post',
      handler: async (req) => {
        if (!req.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        return Response.json(await pushAll(req.payload))
      },
    },
  ],
}
