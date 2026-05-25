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
 * /api/notifications:
 *   get:
 *     summary: Get all notifications
 *     tags: [Notifications]
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
         n.title ILIKE $1
         OR n.message ILIKE $1
         OR n.user_id::text ILIKE $1
         OR u.name ILIKE $1
         OR EXISTS (
           SELECT 1
           FROM notification_user_list nul
           LEFT JOIN users u2 ON nul.user_id = u2.id
           WHERE nul.notification_id_id = n.id
             AND (nul.user_id::text ILIKE $1 OR u2.name ILIKE $1)
         )`
    : ''
  const qValue = `%${q}%`

  if (!wantsPaging) {
    const result = await pool.query(
      `SELECT n.*, u.name as user_name
              , COALESCE(t.target_count, 0) as target_count
              , COALESCE(t.targets, '[]'::jsonb) as targets
       FROM notifications n
       LEFT JOIN users u ON n.user_id = u.id
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
         FROM notification_user_list nul
         LEFT JOIN users u2 ON nul.user_id = u2.id
         WHERE nul.notification_id_id = n.id
       ) t ON TRUE
       ORDER BY n.created_at DESC NULLS LAST, n.id DESC`
    )
    return Response.json(result.rows)
  }

  const countResult = hasQ
    ? await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM notifications n
         LEFT JOIN users u ON n.user_id = u.id
         ${whereSql}`,
        [qValue]
      )
    : await pool.query('SELECT COUNT(*)::int AS total FROM notifications')

  const total = Number(countResult.rows[0]?.total ?? 0)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(page, 1), totalPages)
  const safeOffset = (safePage - 1) * pageSize

  const dataResult = hasQ
    ? await pool.query(
        `SELECT n.*, u.name as user_name
                , COALESCE(t.target_count, 0) as target_count
                , COALESCE(t.targets, '[]'::jsonb) as targets
         FROM notifications n
         LEFT JOIN users u ON n.user_id = u.id
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
           FROM notification_user_list nul
           LEFT JOIN users u2 ON nul.user_id = u2.id
           WHERE nul.notification_id_id = n.id
         ) t ON TRUE
         ${whereSql}
         ORDER BY n.created_at DESC NULLS LAST, n.id DESC
         LIMIT $2 OFFSET $3`,
        [qValue, pageSize, safeOffset]
      )
    : await pool.query(
        `SELECT n.*, u.name as user_name
                , COALESCE(t.target_count, 0) as target_count
                , COALESCE(t.targets, '[]'::jsonb) as targets
         FROM notifications n
         LEFT JOIN users u ON n.user_id = u.id
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
           FROM notification_user_list nul
           LEFT JOIN users u2 ON nul.user_id = u2.id
           WHERE nul.notification_id_id = n.id
         ) t ON TRUE
         ORDER BY n.created_at DESC NULLS LAST, n.id DESC
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
 * /api/notifications:
 *   post:
 *     summary: Create notification
 *     tags: [Notifications]
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as unknown
  if (!body || typeof body !== 'object') {
    return badRequest('Invalid JSON body')
  }
  const { title, message, user_id, user_ids } = body as {
    title?: unknown
    message?: unknown
    user_id?: unknown
    user_ids?: unknown
  }

  if (!isNonEmptyString(title)) return badRequest('title is required')
  if (!isNonEmptyString(message)) return badRequest('message is required')

  const resolvedUserIds = isNonEmptyStringArray(user_ids)
    ? user_ids.map((v) => v.trim())
    : isNonEmptyString(user_id)
      ? [user_id.trim()]
      : []

  if (resolvedUserIds.length === 0) {
    return badRequest('user_ids is required (select at least one target user)')
  }
  if (!resolvedUserIds.every(isUuid)) {
    return badRequest('user_ids must be valid UUIDs')
  }

  const storedUserId = resolvedUserIds.length === 1 ? resolvedUserIds[0] : null

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const result = await client.query(
      `INSERT INTO notifications (title,message,user_id)
       VALUES ($1,$2,$3)
       RETURNING *`,
      [title.trim(), message.trim(), storedUserId]
    )

    const row = result.rows[0]
    if (!row) throw new Error('Failed to create notification')

    await client.query(
      `INSERT INTO notification_user_list (notification_id_id, user_id)
       SELECT $1, unnest($2::uuid[])`,
      [row.id, resolvedUserIds]
    )

    await client.query('COMMIT')
    return Response.json({
      ...row,
      target_count: resolvedUserIds.length,
      targets: resolvedUserIds.map((id) => ({ id })),
    }, { status: 201 })
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
 * /api/notifications:
 *   put:
 *     summary: Update notification
 *     tags: [Notifications]
 */
// Backward-compatible update endpoint (prefer PUT /api/notifications/:id)
export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as unknown
  if (!body || typeof body !== 'object') {
    return badRequest('Invalid JSON body')
  }

  const { id, title, message, user_id } = body as {
    id?: unknown
    title?: unknown
    message?: unknown
    user_id?: unknown
  }

  if (!isNonEmptyString(id)) return badRequest('id is required')
  if (title != null && !isNonEmptyString(title)) {
    return badRequest('title must be a non-empty string')
  }
  if (message != null && !isNonEmptyString(message)) {
    return badRequest('message must be a non-empty string')
  }
  if (user_id != null && !isNonEmptyString(user_id)) {
    return badRequest('user_id must be a non-empty string')
  }

  const result = await pool.query(
    `UPDATE notifications
     SET title = COALESCE($1, title),
         message = COALESCE($2, message),
         user_id = COALESCE($3, user_id)
     WHERE id = $4
     RETURNING *`,
    [
      title == null ? null : (title as string).trim(),
      message == null ? null : (message as string).trim(),
      user_id == null ? null : (user_id as string).trim(),
      (id as string).trim(),
    ]
  )

  const row = result.rows[0]
  if (!row) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json(row)
}

/**
 * @swagger
 * /api/notifications:
 *   delete:
 *     summary: Delete notification
 *     tags: [Notifications]
 */
// Backward-compatible delete endpoint (prefer DELETE /api/notifications/:id)
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
      `DELETE FROM notification_user_list WHERE notification_id_id = $1`,
      [(id as string).trim()]
    )
    const result = await client.query(
      `DELETE FROM notifications WHERE id=$1 RETURNING id`,
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