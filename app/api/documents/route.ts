import { createDocument } from '@/src/server/services/document.service'
import type { NextRequest } from 'next/server'

function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 })
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * @swagger
 * /api/documents:
 *   post:
 *     summary: Create a document and ingest it into RAG chunks
 *     tags: [Documents]
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as unknown
  if (!body || typeof body !== 'object') {
    return badRequest('Invalid JSON body')
  }

  const { title, category, content } = body as {
    title?: unknown
    category?: unknown
    content?: unknown
  }

  if (!isNonEmptyString(title)) return badRequest('title is required')
  if (!isNonEmptyString(category)) return badRequest('category is required')
  if (!isNonEmptyString(content)) return badRequest('content is required')

  try {
    const documentId = await createDocument({
      title,
      category,
      content,
    })

    return Response.json(
      {
        success: true,
        documentId,
      },
      { status: 201 }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create document'
    return Response.json({ error: message }, { status: 500 })
  }
}
