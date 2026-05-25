import { pool } from '@/lib/db'
import type { NextRequest } from 'next/server'

function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 })
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((v) => typeof v === 'string' && v.trim().length > 0)
  )
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  )
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
 * /api/notification-user-groups:
 *   get:
 *     summary: Get all notification user groups
 *     tags: [Notification User Groups]
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
    ? `WHERE
         g.title ILIKE $1
         OR g.id::text ILIKE $1
         OR EXISTS (
           SELECT 1
           FROM notification_user_group_list gl
           LEFT JOIN users u2 ON gl.user_id = u2.id
           WHERE gl.notification_user_group_id = g.id
             AND (
               gl.user_id::text ILIKE $1
               OR u2.name ILIKE $1
               OR u2.email ILIKE $1
             )
         )`
    : ''
  const qValue = `%${q}%`

  const selectSql = `SELECT g.*
          , COALESCE(t.target_count, 0) as target_count
          , COALESCE(t.targets, '[]'::jsonb) as targets
       FROM notification_user_group g
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*)::int AS target_count,
           COALESCE(
             jsonb_agg(
               jsonb_build_object('id', u2.id, 'name', u2.name)
               ORDER BY u2.name
             ) FILTER (WHERE u2.id IS NOT NULL),
             '[]'::jsonb
           ) AS targets
         FROM notification_user_group_list gl
         LEFT JOIN users u2 ON gl.user_id = u2.id
         WHERE gl.notification_user_group_id = g.id
       ) t ON TRUE`

  if (!wantsPaging) {
    const result = await pool.query(
      `${selectSql}
       ORDER BY g.created_at DESC NULLS LAST, g.id DESC`
    )
    return Response.json(result.rows)
  }

  const countResult = hasQ
    ? await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM notification_user_group g
         ${whereSql}`,
        [qValue]
      )
    : await pool.query('SELECT COUNT(*)::int AS total FROM notification_user_group')

  const total = Number(countResult.rows[0]?.total ?? 0)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(page, 1), totalPages)
  const safeOffset = (safePage - 1) * pageSize

  const dataResult = hasQ
    ? await pool.query(
        `${selectSql}
         ${whereSql}
         ORDER BY g.created_at DESC NULLS LAST, g.id DESC
         LIMIT $2 OFFSET $3`,
        [qValue, pageSize, safeOffset]
      )
    : await pool.query(
        `${selectSql}
         ORDER BY g.created_at DESC NULLS LAST, g.id DESC
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
 * /api/notification-user-groups:
 *   post:
 *     summary: Create notification user group
 *     tags: [Notification User Groups]
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as unknown
  if (!body || typeof body !== 'object') {
    return badRequest('Invalid JSON body')
  }

  const { title, user_ids } = body as {
    title?: unknown
    user_ids?: unknown
  }

  if (!isNonEmptyString(title)) return badRequest('title is required')

  const resolvedUserIds = isNonEmptyStringArray(user_ids)
    ? user_ids.map((v) => v.trim())
    : []

  if (resolvedUserIds.length === 0) {
    return badRequest('user_ids is required (select at least one user)')
  }
  if (!resolvedUserIds.every(isUuid)) {
    return badRequest('user_ids must be valid UUIDs')
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const result = await client.query(
      `INSERT INTO notification_user_group (title)
       VALUES ($1)
       RETURNING *`,
      [title.trim()]
    )

    const row = result.rows[0]
    if (!row) throw new Error('Failed to create notification user group')

    await client.query(
      `INSERT INTO notification_user_group_list (notification_user_group_id, user_id)
       SELECT $1, unnest($2::uuid[])`,
      [row.id, resolvedUserIds]
    )

    await client.query('COMMIT')

    return Response.json(
      {
        ...row,
        target_count: resolvedUserIds.length,
        targets: resolvedUserIds.map((id) => ({ id })),
      },
      { status: 201 }
    )
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    const messageText = e instanceof Error ? e.message : 'Failed to create'
    return Response.json({ error: messageText }, { status: 500 })
  } finally {
    client.release()
  }
}

/**
 * @swagger
 * /api/notification-user-groups:
 *   put:
 *     summary: Update notification user group (backward-compatible)
 *     tags: [Notification User Groups]
 */
// Backward-compatible update endpoint (prefer PUT /api/notification-user-groups/:id)
export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as unknown
  if (!body || typeof body !== 'object') {
    return badRequest('Invalid JSON body')
  }

  const { id, title, user_ids } = body as {
    id?: unknown
    title?: unknown
    user_ids?: unknown
  }

  if (!isNonEmptyString(id)) return badRequest('id is required')
  if (title != null && !isNonEmptyString(title)) {
    return badRequest('title must be a non-empty string')
  }

  if (user_ids != null && !isNonEmptyStringArray(user_ids)) {
    return badRequest('user_ids must be a non-empty array of strings')
  }

  const resolvedUserIds = isNonEmptyStringArray(user_ids)
    ? user_ids.map((v) => v.trim())
    : null

  if (resolvedUserIds && !resolvedUserIds.every(isUuid)) {
    return badRequest('user_ids must be valid UUIDs')
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const result = await client.query(
      `UPDATE notification_user_group
       SET title = COALESCE($1, title)
       WHERE id = $2
       RETURNING *`,
      [title == null ? null : (title as string).trim(), (id as string).trim()]
    )

    if (resolvedUserIds) {
      await client.query(
        `DELETE FROM notification_user_group_list WHERE notification_user_group_id = $1`,
        [(id as string).trim()]
      )
      await client.query(
        `INSERT INTO notification_user_group_list (notification_user_group_id, user_id)
         SELECT $1, unnest($2::uuid[])`,
        [(id as string).trim(), resolvedUserIds]
      )
    }

    await client.query('COMMIT')

    const row = result.rows[0]
    if (!row) return Response.json({ error: 'Not found' }, { status: 404 })
    return Response.json(row)
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    const messageText = e instanceof Error ? e.message : 'Failed to update'
    return Response.json({ error: messageText }, { status: 500 })
  } finally {
    client.release()
  }
}

/**
 * @swagger
 * /api/notification-user-groups:
 *   delete:
 *     summary: Delete notification user group (backward-compatible)
 *     tags: [Notification User Groups]
 */
// Backward-compatible delete endpoint (prefer DELETE /api/notification-user-groups/:id)
export async function DELETE(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as unknown
  if (!body || typeof body !== 'object') {
    return badRequest('Invalid JSON body')
  }

  const { id } = body as { id?: unknown }
  if (!isNonEmptyString(id)) return badRequest('id is required')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `DELETE FROM notification_user_group_list WHERE notification_user_group_id = $1`,
      [(id as string).trim()]
    )
    const result = await client.query(
      `DELETE FROM notification_user_group WHERE id=$1 RETURNING id`,
      [(id as string).trim()]
    )
    await client.query('COMMIT')

    if (result.rowCount === 0) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }

    return Response.json({ message: 'Deleted' })
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    const messageText = e instanceof Error ? e.message : 'Failed to delete'
    return Response.json({ error: messageText }, { status: 500 })
  } finally {
    client.release()
  }
}
