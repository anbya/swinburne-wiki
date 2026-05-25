import { pool } from '@/lib/db'
import type { NextRequest } from 'next/server'

function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 })
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * @swagger
 * /api/news/{id}:
 *   get:
 *     summary: Get news by ID
 *     tags: [News]
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const result = await pool.query(
    `SELECT * FROM news WHERE id = $1`,
    [id]
  )

  const row = result.rows[0]
  if (!row) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json(row)
}

/**
 * @swagger
 * /api/news/{id}:
 *   put:
 *     summary: Update news by ID
 *     tags: [News]
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!isNonEmptyString(id)) return badRequest('id is required')

  const body = (await req.json().catch(() => null)) as unknown
  if (!body || typeof body !== 'object') {
    return badRequest('Invalid JSON body')
  }
  const { title, content, author_id } = body as {
    title?: unknown
    content?: unknown
    author_id?: unknown
  }

  if (title != null && !isNonEmptyString(title)) {
    return badRequest('title must be a non-empty string')
  }
  if (content != null && !isNonEmptyString(content)) {
    return badRequest('content must be a non-empty string')
  }
  if (author_id != null && !isNonEmptyString(author_id)) {
    return badRequest('author_id must be a non-empty string')
  }

  const result = await pool.query(
    `UPDATE news
     SET title = COALESCE($1, title),
         content = COALESCE($2, content),
         author_id = COALESCE($3, author_id)
     WHERE id = $4
     RETURNING *`,
    [
      title == null ? null : (title as string).trim(),
      content == null ? null : (content as string).trim(),
      author_id == null ? null : (author_id as string).trim(),
      id.trim(),
    ]
  )

  const row = result.rows[0]
  if (!row) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json(row)
}

/**
 * @swagger
 * /api/news/{id}:
 *   delete:
 *     summary: Delete news by ID
 *     tags: [News]
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!isNonEmptyString(id)) return badRequest('id is required')

  const result = await pool.query(`DELETE FROM news WHERE id=$1 RETURNING id`, [
    id.trim(),
  ])

  if (result.rowCount === 0) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  return Response.json({ message: 'Deleted' })
}