import { pool } from '@/lib/db'
import { ensureWikiSchema } from '@/lib/wiki-schema'
import { syncWikiPageDocument } from '@/src/server/services/document.service'
import type { NextRequest } from 'next/server'

function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 })
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * @swagger
 * /api/wiki-pages/{id}/ingest:
 *   post:
 *     summary: Sync a wiki page into RAG documents and chunks
 *     tags: [Wiki]
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureWikiSchema()

  const { id } = await params
  if (!isNonEmptyString(id)) return badRequest('id is required')

  const result = await pool.query(
    `SELECT wp.id::text, wp.title, wp.content, c.name AS category
     FROM wiki_pages wp
     LEFT JOIN categories c ON c.id = wp.category_id
     WHERE wp.id = $1
     LIMIT 1`,
    [id.trim()]
  )

  const row = result.rows[0] as
    | { id: string; title: string; content: string; category: string | null }
    | undefined

  if (!row) {
    return Response.json({ error: 'Wiki page not found' }, { status: 404 })
  }

  try {
    const documentId = await syncWikiPageDocument({
      wikiPageId: row.id,
      title: row.title,
      content: row.content ?? '',
      category: row.category ?? '',
    })

    return Response.json({ success: true, documentId })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to ingest wiki page'
    return Response.json({ error: message }, { status: 500 })
  }
}