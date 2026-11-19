import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(__filename)

const nextConfig: NextConfig = {
  // Everything (admin, REST API, media, /_next assets) is served under /cms so the CMS
  // can share one domain with the storefront: the top-level Vercel rewrite `/cms/(.*)`
  // routes here without colliding with the storefront's `/` or the API's `/api`.
  // Payload picks this up (NEXT_BASE_PATH): admin = /cms/admin, REST = /cms/api.
  // Keep in sync with CMS_BASE_PATH in src/lib/base-path.ts.
  basePath: '/cms',
  images: {
    localPatterns: [
      {
        pathname: '/api/media/file/**',
      },
    ],
  },
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    return webpackConfig
  },
  turbopack: {
    root: path.resolve(dirname, '../..'), // monorepo root: pnpm links next from there
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
