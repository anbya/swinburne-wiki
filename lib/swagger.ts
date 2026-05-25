import { join } from 'node:path'

import { createSwaggerSpec } from 'next-swagger-doc'
import swaggerJsdoc from 'swagger-jsdoc'

export function getApiDocs() {
  const globalForSwagger = globalThis as unknown as {
    __swaggerSpecCache?: object
  }

  // `createSwaggerSpec` performs filesystem globs over both source and
  // `.next/server/**` outputs. On Windows, repeatedly calling this can be very
  // expensive (high CPU/disk) and may make the machine feel like it's hanging.
  // Cache the spec for the lifetime of the dev server process.
  if (process.env.NODE_ENV !== 'production' && globalForSwagger.__swaggerSpecCache) {
    return globalForSwagger.__swaggerSpecCache
  }

  const definition = {
    openapi: '3.0.0',
    info: {
      title: 'SUTS mobile app API',
      version: '1.0.0',
    },
    components: {
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            email: { type: 'string' },
            role: {
              type: 'string',
              enum: ['students', 'staff', 'security'],
            },
            created_at: { type: 'string' },
          },
        },
        News: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            content: { type: 'string' },
            author_id: { type: 'string' },
            created_at: { type: 'string' },
          },
        },
        Announcement: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            content: { type: 'string' },
            author_id: { type: 'string' },
            created_at: { type: 'string' },
          },
        },
        Notification: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            message: { type: 'string' },
            user_id: { type: 'string' },
            is_read: { type: 'boolean' },
            created_at: { type: 'string' },
          },
        },
      },
    },
  } as const

  const spec =
    process.env.NODE_ENV !== 'production'
      ? swaggerJsdoc({
          // In dev, avoid scanning `.next/server/**` (expensive on Windows).
          apis: [
            ...['ts', 'tsx', 'jsx', 'js', 'json', 'swagger.yaml'].map(
              (fileType) => `${join(process.cwd(), 'app/api')}/**/*.${fileType}`
            ),
            ...['swagger.yaml', 'json'].map(
              (fileType) => `${join(process.cwd(), 'public')}/**/*.${fileType}`
            ),
          ],
          definition,
        })
      : createSwaggerSpec({
          // Important for Vercel/production: next-swagger-doc will scan both the source
          // folder and the built output under `.next/server/<apiFolder>`.
          apiFolder: 'app/api',
          definition,
        })

  if (process.env.NODE_ENV !== 'production') {
    globalForSwagger.__swaggerSpecCache = spec
  }

  return spec
}