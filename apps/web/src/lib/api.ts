import { createApiClient } from '@kskblnk/sdk'

/**
 * Browser -> API. On Vercel the API is public at /api on the same domain (top-level
 * rewrite), so the default is relative. Local `pnpm dev` (separate ports) sets
 * NEXT_PUBLIC_API_URL=http://localhost:4000/api in .env.
 */
export const api = createApiClient(process.env.NEXT_PUBLIC_API_URL || '/api')
