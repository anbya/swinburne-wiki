import { pool } from '@/lib/db'
import { getFirebaseMessaging } from '@/lib/firebase-admin'
import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'

function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 })
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * @swagger
 * /api/notifications/{id}/push:
 *   post:
 *     summary: Send push notification based on notification ID (target by user_id)
 *     tags: [Notifications]
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!id) return badRequest('id is required')

  const body = (await req.json().catch(() => null)) as unknown
    const bodyObj: Record<string, unknown> | null =
      body && typeof body === 'object' ? (body as Record<string, unknown>) : null

    const userIdFromBody = bodyObj?.user_id ?? bodyObj?.userId ?? null

    if (userIdFromBody != null && !isNonEmptyString(userIdFromBody)) {
      return badRequest('user_id must be a non-empty string')
    }

  const notifResult = await pool.query(
    `SELECT n.*
     FROM notifications n
     WHERE n.id = $1`,
    [id]
  )

  const notif = notifResult.rows[0] as
    | {
        id: string
        title?: string | null
        message?: string | null
        user_id?: string | null
      }
    | undefined

  if (!notif) return Response.json({ error: 'Not found' }, { status: 404 })

  const title = (notif.title ?? '').toString().trim()
  const message = (notif.message ?? '').toString().trim()

  if (!title || !message) {
    return badRequest('notification must have title and message')
  }

  const targetUserId = userIdFromBody
    ? (userIdFromBody as string).trim()
    : (notif.user_id ?? '').toString().trim()

  if (!targetUserId) {
    return badRequest(
      'user_id is required (either in body, or notification.user_id must be set)'
    )
  }

  const userResult = await pool.query(
    `SELECT id, fcm_token FROM users WHERE id = $1`,
    [targetUserId]
  )
  const user = userResult.rows[0] as
    | {
        id: string
        fcm_token?: string | null
      }
    | undefined

  if (!user) return Response.json({ error: 'User not found' }, { status: 404 })

  const token = (user.fcm_token ?? '').toString().trim()
  if (!token) {
    return badRequest('User has no fcm_token')
  }

  const messaging = getFirebaseMessaging()

  const notificationPayload = {
    title,
    body: message,
  }

  const dataPayload: Record<string, string> = {
    notificationId: String(notif.id),
  }
  if (notif.user_id) dataPayload.userId = String(notif.user_id)

  try {
    const messageId = await messaging.send({
      token,
      notification: notificationPayload,
      data: dataPayload,
    })

    return Response.json({ ok: true, messageId })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to send push notification'
    return Response.json({ error: message }, { status: 500 })
  }
}
