import { pool } from '@/lib/db'

export type PersistedChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  tokenCount: number | null
  promptTokens: number | null
  completionTokens: number | null
  responseTimeMs: number | null
}

function normalizeDisplayName(name: string | null | undefined, email: string) {
  const trimmedName = name?.trim() ?? ''
  if (trimmedName) return trimmedName

  const localPart = email.split('@')[0]?.trim() ?? ''
  return localPart || email
}

export function buildChatSessionTitle(message: string) {
  const normalized = message.replace(/\s+/g, ' ').trim()
  if (!normalized) return 'Untitled Chat'
  return normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized
}

export async function findUserIdByEmail(email: string) {
  const normalizedEmail = email.trim()
  if (!normalizedEmail) return null

  const result = await pool.query(
    `SELECT id::text
     FROM users
     WHERE LOWER(email) = LOWER($1)
     LIMIT 1`,
    [normalizedEmail]
  )

  return (result.rows[0]?.id as string | undefined) ?? null
}

export async function resolveOrCreateUserId({
  email,
  name,
}: {
  email: string
  name?: string | null
}) {
  const existingId = await findUserIdByEmail(email)
  if (existingId) return existingId

  const result = await pool.query(
    `INSERT INTO users (name, email, role)
     VALUES ($1, $2, NULL)
     RETURNING id::text`,
    [normalizeDisplayName(name, email), email.trim()]
  )

  return result.rows[0]?.id as string
}

export async function listChatSessionsByUserId(userId: string) {
  const result = await pool.query(
    `SELECT
       id::text,
       title,
       model_name,
       total_messages,
       created_at::text,
       updated_at::text
     FROM chat_sessions
     WHERE user_id = $1
       AND deleted_at IS NULL
     ORDER BY updated_at DESC, created_at DESC`,
    [userId]
  )

  return result.rows as Array<{
    id: string
    title: string
    model_name: string | null
    total_messages: number
    created_at: string
    updated_at: string
  }>
}

export async function getChatMessagesBySessionId({
  sessionId,
  userId,
}: {
  sessionId: string
  userId: string
}) {
  const sessionResult = await pool.query(
    `SELECT id::text
     FROM chat_sessions
     WHERE id = $1
       AND user_id = $2
       AND deleted_at IS NULL
     LIMIT 1`,
    [sessionId, userId]
  )

  if (!sessionResult.rows[0]?.id) {
    return null
  }

  const result = await pool.query(
    `SELECT
       id::text,
       content,
       token_count,
       prompt_tokens,
       completion_tokens,
       response_time_ms,
       created_at::text
     FROM chat_messages
     WHERE session_id = $1
     ORDER BY created_at ASC, id ASC`,
    [sessionId]
  )

  return result.rows.map((row, index) => ({
    id: String(row.id),
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: String(row.content ?? ''),
    createdAt: String(row.created_at ?? ''),
    tokenCount: typeof row.token_count === 'number' ? row.token_count : null,
    promptTokens: typeof row.prompt_tokens === 'number' ? row.prompt_tokens : null,
    completionTokens: typeof row.completion_tokens === 'number' ? row.completion_tokens : null,
    responseTimeMs: typeof row.response_time_ms === 'number' ? row.response_time_ms : null,
  })) as PersistedChatMessage[]
}

export async function saveChatExchange({
  userId,
  sessionId,
  userMessage,
  assistantMessage,
  modelName,
  promptTokens,
  completionTokens,
  tokenCount,
  responseTimeMs,
}: {
  userId: string
  sessionId?: string | null
  userMessage: string
  assistantMessage: string
  modelName: string | null
  promptTokens?: number | null
  completionTokens?: number | null
  tokenCount?: number | null
  responseTimeMs?: number | null
}) {
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    let resolvedSessionId = sessionId?.trim() ?? ''
    const nextTitle = buildChatSessionTitle(userMessage)

    if (resolvedSessionId) {
      const existingResult = await client.query(
        `SELECT id::text
         FROM chat_sessions
         WHERE id = $1
           AND user_id = $2
           AND deleted_at IS NULL
         LIMIT 1`,
        [resolvedSessionId, userId]
      )

      if (!existingResult.rows[0]?.id) {
        throw new Error('Chat session not found')
      }
    } else {
      const insertedSession = await client.query(
        `INSERT INTO chat_sessions (user_id, title, model_name, total_messages)
         VALUES ($1, $2, $3, 0)
         RETURNING id::text`,
        [userId, nextTitle, modelName]
      )

      resolvedSessionId = String(insertedSession.rows[0]?.id ?? '')
      if (!resolvedSessionId) {
        throw new Error('Failed to create chat session')
      }
    }

    await client.query(
      `INSERT INTO chat_messages (session_id, content)
       VALUES ($1, $2)`,
      [resolvedSessionId, userMessage]
    )

    await client.query(
      `INSERT INTO chat_messages (
         session_id,
         content,
         token_count,
         prompt_tokens,
         completion_tokens,
         response_time_ms
       )
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        resolvedSessionId,
        assistantMessage,
        tokenCount ?? null,
        promptTokens ?? null,
        completionTokens ?? null,
        responseTimeMs ?? null,
      ]
    )

    await client.query(
      `UPDATE chat_sessions
       SET title = CASE
             WHEN total_messages = 0 OR title = 'Untitled Chat' THEN $2
             ELSE title
           END,
           model_name = COALESCE($3, model_name),
           total_messages = total_messages + 2,
           updated_at = NOW()
       WHERE id = $1`,
      [resolvedSessionId, nextTitle, modelName]
    )

    await client.query('COMMIT')

    return {
      sessionId: resolvedSessionId,
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
