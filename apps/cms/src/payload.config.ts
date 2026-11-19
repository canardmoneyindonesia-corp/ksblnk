import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

import { Media } from './collections/Media'
import { Orders } from './collections/Orders'
import { Products } from './collections/Products'
import { Users } from './collections/Users'
import { OrderSync } from './globals/OrderSync'
import { startOrderImport } from './lib/orders'
import { pushAll } from './lib/sync'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  serverURL: process.env.CMS_PUBLIC_URL || 'http://localhost:3001',
  admin: {
    user: Users.slug,
    meta: { titleSuffix: ' · KSKBLNK CMS' },
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Orders, Products, Media, Users],
  globals: [OrderSync],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
  }),
  sharp,
  plugins: [],
  // Re-push the full catalog every time the CMS boots: if the API's Redis was
  // ever wiped or missed an update, it heals itself. Never blocks startup.
  onInit: async (payload) => {
    // Pull paid orders from the API on boot and every 30 s (ORDER_IMPORT_INTERVAL_SECONDS).
    startOrderImport(payload)
    if (process.env.SYNC_ON_BOOT === 'false') return
    setTimeout(() => {
      pushAll(payload).catch((e) => payload.logger.error(`[sync] boot sync failed: ${e.message}`))
    }, 2000)
  },
})
