import { createApiClient } from '@kskblnk/sdk'

export const api = createApiClient(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000')
