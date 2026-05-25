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

/**
 * @swagger
 * /api/notification-user-groups/{id}:
 *   get:
 *     summary: Get notification user group by ID
 *     tags: [Notification User Groups]
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const result = await pool.query(
    `SELECT g.*
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
     ) t ON TRUE
     WHERE g.id = $1`,
    [id]
  )

  const row = result.rows[0]
  if (!row) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json(row)
}

/**
 * @swagger
 * /api/notification-user-groups/{id}:
 *   put:
 *     summary: Update notification user group by ID
 *     tags: [Notification User Groups]
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

  const { title, user_ids } = body as {
    title?: unknown
    user_ids?: unknown
  }

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
      [title == null ? null : (title as string).trim(), id]
    )

    if (resolvedUserIds) {
      await client.query(
        `DELETE FROM notification_user_group_list WHERE notification_user_group_id = $1`,
        [id]
      )
      await client.query(
        `INSERT INTO notification_user_group_list (notification_user_group_id, user_id)
         SELECT $1, unnest($2::uuid[])`,
        [id, resolvedUserIds]
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
 * /api/notification-user-groups/{id}:
 *   delete:
 *     summary: Delete notification user group by ID
 *     tags: [Notification User Groups]
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!id) return badRequest('id is required')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `DELETE FROM notification_user_group_list WHERE notification_user_group_id = $1`,
      [id]
    )
    const result = await client.query(
      `DELETE FROM notification_user_group WHERE id=$1 RETURNING id`,
      [id]
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
