/**
 * Local demo data: an admin user + 6 products with generated placeholder photos.
 *   pnpm seed        (from the repo root, with Postgres up)
 * Safe to re-run: does nothing if products already exist.
 */
import config from '@payload-config'
import { getPayload } from 'payload'
import sharp from 'sharp'
import { pushAll } from './lib/sync'

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@kskblnk.local'
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'kskblnk-admin'

const SIZES = ['S', 'M', 'L', 'XL']

const products = [
  { name: 'Logo Tee Black', code: 'TEE-BLK', price: 350000, bg: '#111111', fg: '#f4f4f0', sizes: SIZES, stock: [6, 12, 12, 4] },
  { name: 'Logo Tee Bone', code: 'TEE-BON', price: 350000, bg: '#e9e4d8', fg: '#111111', sizes: SIZES, stock: [5, 10, 10, 5] },
  { name: 'Heavy Hoodie', code: 'HOOD-BLK', price: 850000, bg: '#2b2b2b', fg: '#d8ff3c', sizes: SIZES, stock: [3, 8, 8, 3] },
  { name: 'Longsleeve Static', code: 'LS-STA', price: 450000, bg: '#3c4a5c', fg: '#f4f4f0', sizes: SIZES, stock: [4, 6, 6, 2] },
  { name: '6-Panel Cap', code: 'CAP-BLK', price: 275000, bg: '#151515', fg: '#ff4d2e', sizes: ['OS'], stock: [25] },
  // Upcoming drop: shows a countdown, checkout refused by the API until dropAt.
  { name: 'Tote Bag 002', code: 'TOTE-002', price: 199000, bg: '#d8ff3c', fg: '#111111', sizes: ['OS'], stock: [40], dropInHours: 48 },
]

function placeholder(label: string, bg: string, fg: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500">
    <rect width="100%" height="100%" fill="${bg}"/>
    <text x="50%" y="47%" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-size="120" font-weight="900" fill="${fg}">KSKBLNK</text>
    <text x="50%" y="56%" text-anchor="middle" font-family="Arial, sans-serif" font-size="56" fill="${fg}" opacity="0.7">${label}</text>
  </svg>`
  return sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer()
}

const payload = await getPayload({ config })

const existing = await payload.count({ collection: 'products', overrideAccess: true })
if (existing.totalDocs > 0) {
  payload.logger.info(`Seed skipped: ${existing.totalDocs} products already exist.`)
  process.exit(0)
}

const users = await payload.count({ collection: 'users', overrideAccess: true })
if (users.totalDocs === 0) {
  await payload.create({ collection: 'users', data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } })
  payload.logger.info(`Admin created: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD} (change it!)`)
}

for (const [i, p] of products.entries()) {
  const images = []
  for (const view of ['FRONT', 'BACK']) {
    const media = await payload.create({
      collection: 'media',
      data: { alt: `${p.name} ${view.toLowerCase()}` },
      file: {
        data: await placeholder(`${p.name.toUpperCase()} / ${view}`, p.bg, p.fg),
        mimetype: 'image/jpeg',
        name: `${p.code.toLowerCase()}-${view.toLowerCase()}.jpg`,
        size: 0,
      },
    })
    images.push(media.id)
  }

  await payload.create({
    collection: 'products',
    overrideAccess: true,
    data: {
      name: p.name,
      slug: '',
      published: true,
      sortOrder: i,
      price: p.price,
      description: `${p.name}. Limited run, printed in small batches. No restock guaranteed.`,
      images,
      dropAt: p.dropInHours ? new Date(Date.now() + p.dropInHours * 3_600_000).toISOString() : null,
      variants: p.sizes.map((size, j) => ({ label: size, sku: `${p.code}-${size}`, stock: p.stock[j] ?? 0 })),
    },
  })
  payload.logger.info(`Created ${p.name}`)
}

const res = await pushAll(payload)
payload.logger.info(`Seed done. API sync: ${res.ok ? 'ok' : 'FAILED (start the API, then restart the CMS)'}`)
process.exit(0)
