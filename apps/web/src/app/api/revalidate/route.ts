import { revalidatePath, revalidateTag } from 'next/cache'

/**
 * Called by the CMS after every product save. Purges the cached product list and
 * every page built from it; the next visitor gets freshly generated HTML which
 * the CDN then serves to everyone else.
 *
 * On Vercel this is public at /api/revalidate (vercel.json routes it here ahead of the
 * api service's /api/*), so the secret check is what protects it. The CMS calls it over
 * the public URL: a cms -> web binding would be circular (web already binds to cms).
 */
export async function POST(req: Request) {
  const secret = process.env.REVALIDATE_SECRET
  if (!secret || req.headers.get('x-revalidate-secret') !== secret) {
    return Response.json({ ok: false }, { status: 401 })
  }
  revalidateTag('products', { expire: 0 })
  revalidatePath('/', 'layout')
  return Response.json({ ok: true, at: Date.now() })
}
