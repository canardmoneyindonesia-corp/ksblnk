import { NextResponse } from 'next/server'

/**
 * Demo mode (no DATABASE_URL, e.g. a Vercel deploy with an empty environment): Payload can't
 * run without Postgres, so answer every /cms request with a short explanation instead of a
 * crash. The storefront and the API run on the demo catalog meanwhile (see "Demo mode" in the
 * README). With a DATABASE_URL this lets every request through untouched.
 */
export function proxy() {
  if (process.env.DATABASE_URL) return NextResponse.next()
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CMS · demo mode</title>
<body style="font:16px/1.5 system-ui,sans-serif;max-width:34rem;margin:15vh auto;padding:0 16px">
<h1 style="font-size:1.4rem">The CMS is off in demo mode</h1>
<p>No <code>DATABASE_URL</code> is set, so the store runs on the built-in demo catalog: browse, add to bag and check out on the <a href="/">storefront</a>. Payments are simulated and stock lives in memory.</p>
<p>To manage real products and orders, add <code>DATABASE_URL</code> (Postgres) and <code>PAYLOAD_SECRET</code>, plus <code>REDIS_URL</code> for the API, then redeploy.</p>
</body>`,
    { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  )
}

export const config = {
  // Skip Next's own assets (the matcher is relative to basePath /cms).
  matcher: '/((?!_next/).*)',
}
