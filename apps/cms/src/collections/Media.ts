import type { CollectionConfig } from 'payload'

/**
 * Product photos. In production, add a storage adapter (e.g. @payloadcms/storage-s3
 * pointing at S3 / Cloudflare R2) so files live on object storage, not the CMS disk.
 * The storefront serves them through next/image, so the CDN absorbs drop traffic.
 */
export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
  ],
  upload: {
    mimeTypes: ['image/*'],
  },
}
