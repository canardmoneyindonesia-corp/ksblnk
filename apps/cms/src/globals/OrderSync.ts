import type { GlobalConfig } from 'payload'

/** Internal bookkeeping for the order import (see lib/orders.ts). Hidden from the admin nav. */
export const OrderSync: GlobalConfig = {
  slug: 'order-sync',
  admin: { hidden: true },
  access: {
    read: ({ req }) => Boolean(req.user),
    update: () => false,
  },
  fields: [
    { name: 'cursor', type: 'number', defaultValue: 0, admin: { readOnly: true } },
    { name: 'lastImportAt', type: 'date', admin: { readOnly: true } },
  ],
}
