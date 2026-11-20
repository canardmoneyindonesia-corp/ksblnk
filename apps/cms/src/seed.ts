/**
 * Local data: an admin user + the products of the modeled shoot, taken from the demo catalog
 * (packages/types/src/demo-catalog.json) with its photos (apps/web/public/demo/), so the
 * database store and the no-database demo sell the same pieces.
 *
 *   pnpm seed          (from the repo root, with Postgres up) - does nothing if products exist
 *   pnpm seed:reset    deletes every product (and its photos), then seeds the catalog again
 */
import config from '@payload-config'
import { DEMO_CATALOG } from '@kskblnk/types/demo'
import { readFile } from 'fs/promises'
import path from 'path'
import { getPayload } from 'payload'
import { fileURLToPath } from 'url'
import { pushAll } from './lib/sync'

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@kskblnk.local'
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'kskblnk-admin'
const RESET = process.argv.includes('--reset') || process.env.SEED_RESET === '1'

/** The demo photos are the storefront's public files: /demo/x.jpg -> apps/web/public/demo/x.jpg */
const WEB_PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/public')

const payload = await getPayload({ config })

const existing = await payload.find({
  collection: 'products',
  depth: 0,
  pagination: false,
  overrideAccess: true,
})
if (existing.docs.length > 0) {
  if (!RESET) {
    payload.logger.info(
      `Seed skipped: ${existing.docs.length} products already exist. Run "pnpm seed:reset" to replace them with the catalog.`,
    )
    process.exit(0)
  }
  const mediaIds = new Set<number | string>()
  for (const p of existing.docs) {
    for (const img of p.images ?? []) mediaIds.add(typeof img === 'object' ? img.id : img)
    await payload.delete({ collection: 'products', id: p.id, overrideAccess: true })
  }
  for (const id of mediaIds) {
    await payload.delete({ collection: 'media', id, overrideAccess: true }).catch(() => {})
  }
  payload.logger.info(`Reset: deleted ${existing.docs.length} products and ${mediaIds.size} photos.`)
}

const users = await payload.count({ collection: 'users', overrideAccess: true })
if (users.totalDocs === 0) {
  await payload.create({ collection: 'users', data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } })
  payload.logger.info(`Admin created: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD} (change it!)`)
}

for (const [i, p] of DEMO_CATALOG.entries()) {
  const images = []
  for (const img of p.images) {
    const file = path.join(WEB_PUBLIC, img.url)
    const data = await readFile(file)
    const media = await payload.create({
      collection: 'media',
      data: { alt: img.alt || p.name },
      file: { data, mimetype: 'image/jpeg', name: path.basename(file), size: data.length },
    })
    images.push(media.id)
  }

  await payload.create({
    collection: 'products',
    overrideAccess: true,
    data: {
      name: p.name,
      slug: p.slug,
      published: true,
      sortOrder: i,
      price: p.price,
      description: p.description,
      images,
      dropAt: p.dropAt,
      variants: p.variants.map(({ label, sku, stock }) => ({ label, sku, stock })),
    },
  })
  payload.logger.info(`Created ${p.name} (${images.length} photos)`)
}

const res = await pushAll(payload)
payload.logger.info(`Seed done. API sync: ${res.ok ? 'ok' : 'FAILED (start the API, then restart the CMS)'}`)
process.exit(0)
