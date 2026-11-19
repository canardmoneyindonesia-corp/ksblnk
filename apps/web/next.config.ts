import type { NextConfig } from 'next'

const cms = new URL(process.env.CMS_URL ?? 'http://localhost:3001')
const cmsIsLocal = ['localhost', '127.0.0.1'].includes(cms.hostname)

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
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    // Only needed for local dev, where the CMS runs on localhost.
    dangerouslyAllowLocalIP: cmsIsLocal,
  },
  poweredByHeader: false,
}

export default nextConfig
