import { pool } from '@/lib/db'
import { ensureWikiSchema } from '@/lib/wiki-schema'
import type { NextRequest } from 'next/server'

function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 })
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * @swagger
 * /api/categories/{id}:
 *   get:
 *     summary: Get category by ID
 *     tags: [Categories]
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureWikiSchema()

  const { id } = await params
  const result = await pool.query(
    'SELECT id::text, name, parent_id::text FROM categories WHERE id = $1',
    [id]
  )

  const row = result.rows[0]
  if (!row) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json(row)
}

/**
 * @swagger
 * /api/categories/{id}:
 *   put:
 *     summary: Update category by ID
 *     tags: [Categories]
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureWikiSchema()

  const { id } = await params
  if (!isNonEmptyString(id)) return badRequest('id is required')

  const body = (await req.json().catch(() => null)) as unknown
  if (!body || typeof body !== 'object') {
    return badRequest('Invalid JSON body')
  }

  const parsed = body as Record<string, unknown>
  const name = parsed.name
  const parent_id = parsed.parent_id
  const hasParentId = Object.prototype.hasOwnProperty.call(parsed, 'parent_id')

  if (name != null && !isNonEmptyString(name)) {
    return badRequest('name must be a non-empty string')
  }
  if (hasParentId && parent_id != null && !isNonEmptyString(parent_id)) {
    return badRequest('parent_id must be a non-empty string or null')
  }

  const trimmedName = name == null ? null : (name as string).trim()
  const trimmedParentId =
    parent_id == null ? null : (parent_id as string).trim()

  if (hasParentId && trimmedParentId != null) {
    if (trimmedParentId === id) {
      return badRequest('parent_id cannot be the same as id')
    }

    const parentExists = await pool.query(
      'SELECT 1 FROM categories WHERE id = $1',
      [trimmedParentId]
    )
    if ((parentExists.rowCount ?? 0) === 0) {
      return badRequest('parent_id not found')
    }

    const cycleCheck = await pool.query(
      `WITH RECURSIVE ancestors AS (
         SELECT id, parent_id FROM categories WHERE id = $1
         UNION ALL
         SELECT c.id, c.parent_id
         FROM categories c
         JOIN ancestors a ON c.id = a.parent_id
       )
       SELECT 1 FROM ancestors WHERE id = $2 LIMIT 1`,
      [trimmedParentId, id]
    )
    if ((cycleCheck.rowCount ?? 0) > 0) {
      return badRequest('parent_id would create a cycle')
    }
  }

  const result = hasParentId
    ? await pool.query(
        `UPDATE categories
         SET name = COALESCE($1, name),
             parent_id = $2
         WHERE id = $3
         RETURNING id::text, name, parent_id::text`,
        [trimmedName, trimmedParentId, id]
      )
    : await pool.query(
        `UPDATE categories
         SET name = COALESCE($1, name)
         WHERE id = $2
         RETURNING id::text, name, parent_id::text`,
        [trimmedName, id]
      )

  const row = result.rows[0]
  if (!row) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json(row)
}

/**
 * @swagger
 * /api/categories/{id}:
 *   delete:
 *     summary: Delete category by ID
 *     tags: [Categories]
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureWikiSchema()

  const { id } = await params
  if (!isNonEmptyString(id)) return badRequest('id is required')

  const result = await pool.query(
    'DELETE FROM categories WHERE id = $1 RETURNING id::text',
    [id.trim()]
  )

  if (result.rowCount === 0) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  return Response.json({ message: 'Deleted' })
}
