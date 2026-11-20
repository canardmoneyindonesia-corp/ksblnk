import type { NextConfig } from 'next'

// Local dev: photos come from the CMS on another port (absolute URLs, remotePatterns below).
// On Vercel they are relative (/cms/api/media/file/...) on the same domain, which next/image
// allows by default, and the CMS_URL binding is not available while this file is evaluated.
const cms = new URL(process.env.CMS_URL ?? 'http://localhost:3001')
const cmsIsLocal = !process.env.VERCEL && ['localhost', '127.0.0.1'].includes(cms.hostname)

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ['@kskblnk/sdk', '@kskblnk/types', '@kskblnk/ui'],
  images: {
    // Product photos are optimized once per size and then served from the CDN:
    // during a drop the CMS / bucket never sees the traffic.
    remotePatterns: [
      {
        protocol: cms.protocol.replace(':', '') as 'http' | 'https',
        hostname: cms.hostname,
        port: cms.port,
        pathname: '/**',
      },
      // Production media on object storage, e.g. https://media.example.com/** (add yours here)
    ],
    // Vercel "services" deployments (vercel.json) don't route /_next/image to Vercel's image
    // optimizer: it answers 404 and every photo shows blank. So on Vercel, <Image> points
    // straight at the file (/demo/... or /cms/api/media/file/...), which the CDN caches.
    unoptimized: Boolean(process.env.VERCEL),
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    // Only needed for local dev, where the CMS runs on localhost.
    dangerouslyAllowLocalIP: cmsIsLocal,
  },
  poweredByHeader: false,
  // Local run with no NEXT_PUBLIC_API_URL (e.g. demo mode with an empty .env): the browser
  // calls the relative /api like on Vercel, so forward it to the API on :4000. Array form =
  // afterFiles, so the storefront's own /api/revalidate route still wins.
  async rewrites() {
    if (process.env.VERCEL || process.env.NEXT_PUBLIC_API_URL) return []
    return [{ source: '/api/:path*', destination: `${process.env.API_URL ?? 'http://localhost:4000'}/api/:path*` }]
  },
}

export default nextConfig
