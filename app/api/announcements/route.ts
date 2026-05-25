import { pool } from '@/lib/db'
import type { NextRequest } from 'next/server'

function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 })
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) return fallback
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  const i = Math.floor(n)
  if (i <= 0) return fallback
  return i
}

/**
 * @swagger
 * /api/announcements:
 *   get:
 *     summary: Get all announcements
 *     tags: [Announcements]
 */
export async function GET(req: NextRequest) {
  const pageParam = req.nextUrl.searchParams.get('page')
  const pageSizeParam = req.nextUrl.searchParams.get('pageSize')
  const qParam = req.nextUrl.searchParams.get('q')

  const wantsPaging = pageParam != null || pageSizeParam != null || qParam != null
  const pageSize = Math.min(parsePositiveInt(pageSizeParam, 10), 100)
  const page = parsePositiveInt(pageParam, 1)

  const q = (qParam ?? '').trim()
  const hasQ = q.length > 0
  const whereSql = hasQ
    ? 'WHERE a.title ILIKE $1 OR a.content ILIKE $1 OR a.author_id::text ILIKE $1 OR u.name ILIKE $1'
    : ''
  const qValue = `%${q}%`

  if (!wantsPaging) {
    const result = await pool.query(
      `SELECT a.*, u.name as author_name
       FROM announcements a
       LEFT JOIN users u ON a.author_id = u.id
       ORDER BY a.created_at DESC NULLS LAST, a.id DESC`
    )
    return Response.json(result.rows)
  }

  const countResult = hasQ
    ? await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM announcements a
         LEFT JOIN users u ON a.author_id = u.id
         ${whereSql}`,
        [qValue]
      )
    : await pool.query('SELECT COUNT(*)::int AS total FROM announcements')

  const total = Number(countResult.rows[0]?.total ?? 0)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(page, 1), totalPages)
  const safeOffset = (safePage - 1) * pageSize

  const dataResult = hasQ
    ? await pool.query(
        `SELECT a.*, u.name as author_name
         FROM announcements a
         LEFT JOIN users u ON a.author_id = u.id
         ${whereSql}
         ORDER BY a.created_at DESC NULLS LAST, a.id DESC
         LIMIT $2 OFFSET $3`,
        [qValue, pageSize, safeOffset]
      )
    : await pool.query(
        `SELECT a.*, u.name as author_name
         FROM announcements a
         LEFT JOIN users u ON a.author_id = u.id
         ORDER BY a.created_at DESC NULLS LAST, a.id DESC
         LIMIT $1 OFFSET $2`,
        [pageSize, safeOffset]
      )

  return Response.json({
    data: dataResult.rows,
    meta: {
      page: safePage,
      pageSize,
      total,
      totalPages,
      q: q || null,
    },
  })
}

/**
 * @swagger
 * /api/announcements:
 *   post:
 *     summary: Create announcement
 *     tags: [Announcements]
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as unknown
  if (!body || typeof body !== 'object') {
    return badRequest('Invalid JSON body')
  }
  const { title, content, author_id } = body as {
    title?: unknown
    content?: unknown
    author_id?: unknown
  }

  if (!isNonEmptyString(title)) return badRequest('title is required')
  if (!isNonEmptyString(content)) return badRequest('content is required')
  if (author_id != null && !isNonEmptyString(author_id)) {
    return badRequest('author_id must be a non-empty string')
  }

  const result = await pool.query(
    `INSERT INTO announcements (title,content,author_id)
     VALUES ($1,$2,$3)
     RETURNING *`,
    [title.trim(), content.trim(), author_id ?? null]
  )

  return Response.json(result.rows[0], { status: 201 })
}

/**
 * @swagger
 * /api/announcements:
 *   put:
 *     summary: Update announcement
 *     tags: [Announcements]
 */
// Backward-compatible update endpoint (prefer PUT /api/announcements/:id)
export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as unknown
  if (!body || typeof body !== 'object') {
    return badRequest('Invalid JSON body')
  }
  const { id, title, content, author_id } = body as {
    id?: unknown
    title?: unknown
    content?: unknown
    author_id?: unknown
  }

  if (!isNonEmptyString(id)) return badRequest('id is required')
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
      (id as string).trim(),
    ]
  )

  const row = result.rows[0]
  if (!row) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json(row)
}

/**
 * @swagger
 * /api/announcements:
 *   delete:
 *     summary: Delete announcement
 *     tags: [Announcements]
 */
// Backward-compatible delete endpoint (prefer DELETE /api/announcements/:id)
export async function DELETE(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as unknown
  if (!body || typeof body !== 'object') {
    return badRequest('Invalid JSON body')
  }
  const { id } = body as { id?: unknown }
  if (!isNonEmptyString(id)) return badRequest('id is required')

  const result = await pool.query(
    `DELETE FROM announcements WHERE id=$1 RETURNING id`,
    [(id as string).trim()]
  )

  if (result.rowCount === 0) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  return Response.json({ message: 'Deleted' })
}