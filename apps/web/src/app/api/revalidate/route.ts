import { revalidatePath, revalidateTag } from 'next/cache'

/**
 * Called by the CMS after every product save. Purges the cached product list and
 * every page built from it; the next visitor gets freshly generated HTML which
 * the CDN then serves to everyone else.
 *
 * On Vercel this route is not public: /api/* on the domain goes to the api service.
 * The CMS reaches it over its WEB_URL service binding. The secret check stays as defence in depth.
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
