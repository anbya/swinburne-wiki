import { pool } from '@/lib/db'
import type { ChatSource } from '@/src/server/services/rag-chat.service'

const CHAT_MESSAGE_SCHEMA_VERSION = 3

let chatMessageSchemaReady: { version: number; promise: Promise<void> } | null = null

export type PersistedChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  modelName: string | null
  tokenCount: number | null
  promptTokens: number | null
  completionTokens: number | null
  responseTimeMs: number | null
  sources: ChatSource[]
}

async function ensureChatMessageSchema() {
  if (
    !chatMessageSchemaReady ||
    chatMessageSchemaReady.version !== CHAT_MESSAGE_SCHEMA_VERSION
  ) {
    chatMessageSchemaReady = {
      version: CHAT_MESSAGE_SCHEMA_VERSION,
      promise: (async () => {
        await pool.query('ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS sources JSONB;')
        await pool.query(
          "ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS role VARCHAR(20);"
        )
        await pool.query(
          'ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS model_name VARCHAR(255);'
        )

        await pool.query(`
          WITH ranked_messages AS (
            SELECT
              id,
              session_id,
              sources,
              token_count,
              prompt_tokens,
              completion_tokens,
              response_time_ms,
              ROW_NUMBER() OVER (
                PARTITION BY session_id
                ORDER BY created_at ASC, ctid ASC
              ) AS message_rank
            FROM chat_messages
          )
          UPDATE chat_messages cm
          SET role = CASE
            WHEN rm.sources IS NOT NULL
              OR rm.token_count IS NOT NULL
              OR rm.prompt_tokens IS NOT NULL
              OR rm.completion_tokens IS NOT NULL
              OR rm.response_time_ms IS NOT NULL
            THEN 'assistant'
            WHEN rm.message_rank % 2 = 1 THEN 'user'
            ELSE 'assistant'
          END
          FROM ranked_messages rm
          WHERE cm.id = rm.id
            AND (cm.role IS NULL OR cm.role NOT IN ('user', 'assistant'));
        `)
      })(),
    }
  }

  await chatMessageSchemaReady.promise
}

function parseSources(value: unknown): ChatSource[] {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null

      const row = item as {
        title?: unknown
        score?: unknown
        sourceUrl?: unknown
        sourceType?: unknown
      }

      return {
        title: typeof row.title === 'string' && row.title.trim() ? row.title : 'Untitled',
        score: typeof row.score === 'number' ? row.score : 0,
        sourceUrl: typeof row.sourceUrl === 'string' ? row.sourceUrl : null,
        sourceType: typeof row.sourceType === 'string' ? row.sourceType : null,
      } satisfies ChatSource
    })
    .filter((item): item is ChatSource => item != null)
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
  await ensureChatMessageSchema()

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
       role,
       content,
       model_name,
       sources,
       token_count,
       prompt_tokens,
       completion_tokens,
       response_time_ms,
       created_at::text
     FROM chat_messages
     WHERE session_id = $1
     ORDER BY
       created_at ASC,
       CASE role WHEN 'user' THEN 0 WHEN 'assistant' THEN 1 ELSE 2 END ASC,
       id ASC`,
    [sessionId]
  )

  return result.rows.map((row) => ({
    id: String(row.id),
    role: row.role === 'assistant' ? 'assistant' : 'user',
    content: String(row.content ?? ''),
    createdAt: String(row.created_at ?? ''),
    modelName: typeof row.model_name === 'string' ? row.model_name : null,
    tokenCount: typeof row.token_count === 'number' ? row.token_count : null,
    promptTokens: typeof row.prompt_tokens === 'number' ? row.prompt_tokens : null,
    completionTokens: typeof row.completion_tokens === 'number' ? row.completion_tokens : null,
    responseTimeMs: typeof row.response_time_ms === 'number' ? row.response_time_ms : null,
    sources: parseSources(row.sources),
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
  sources,
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
  sources?: ChatSource[]
}) {
  await ensureChatMessageSchema()

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
      `INSERT INTO chat_messages (session_id, role, content)
       VALUES ($1, $2, $3)`,
      [resolvedSessionId, 'user', userMessage]
    )

    await client.query(
      `INSERT INTO chat_messages (
         session_id,
         role,
         content,
         model_name,
         sources,
         token_count,
         prompt_tokens,
         completion_tokens,
         response_time_ms
       )
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)`,
      [
        resolvedSessionId,
        'assistant',
        assistantMessage,
        modelName,
        JSON.stringify(sources ?? []),
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
