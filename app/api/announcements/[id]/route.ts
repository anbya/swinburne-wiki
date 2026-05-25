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
 * /api/announcements/{id}:
 *   get:
 *     summary: Get announcement by ID
 *     tags: [Announcements]
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const result = await pool.query(
    `SELECT a.*, u.name as author_name
     FROM announcements a
     LEFT JOIN users u ON a.author_id = u.id
     WHERE a.id = $1`,
    [id]
  )

  const row = result.rows[0]
  if (!row) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json(row)
}

/**
 * @swagger
 * /api/announcements/{id}:
 *   put:
 *     summary: Update announcement by ID
 *     tags: [Announcements]
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!id) return badRequest('id is required')

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
    `UPDATE announcements
     SET title = COALESCE($1, title),
         content = COALESCE($2, content),
         author_id = COALESCE($3, author_id)
     WHERE id = $4
     RETURNING *`,
    [
      title == null ? null : (title as string).trim(),
      content == null ? null : (content as string).trim(),
      author_id == null ? null : (author_id as string).trim(),
      id,
    ]
  )

  const row = result.rows[0]
  if (!row) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json(row)
}

/**
 * @swagger
 * /api/announcements/{id}:
 *   delete:
 *     summary: Delete announcement by ID
 *     tags: [Announcements]
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!id) return badRequest('id is required')

  const result = await pool.query(
    `DELETE FROM announcements WHERE id=$1 RETURNING id`,
    [id]
  )

  if (result.rowCount === 0) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  return Response.json({ message: 'Deleted' })
}