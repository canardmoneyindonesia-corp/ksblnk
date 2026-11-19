/**
 * Demo mode (server only): products come from packages/types/src/demo-catalog.json instead
 * of the CMS, so the store can be clicked through with no database at all. The API has the
 * matching switch (no REDIS_URL -> in-memory stock seeded from the same file).
 *
 * DEMO_MODE=1 forces it on, DEMO_MODE=0 forces it off. Otherwise it is on when no CMS is
 * configured: on Vercel the CMS_URL binding always exists, so "configured" means the CMS has
 * a database (DATABASE_URL, a project env var shared by all services); locally it means
 * CMS_URL is set.
 */
export function isDemo() {
  const flag = process.env.DEMO_MODE?.trim().toLowerCase()
  if (flag === '1' || flag === 'true') return true
  if (flag === '0' || flag === 'false') return false
  return process.env.VERCEL ? !process.env.DATABASE_URL : !process.env.CMS_URL
}
