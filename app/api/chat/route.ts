import { getServerSessionSafe } from '@/lib/auth'
import { DEFAULT_CHAT_MODEL, isSupportedChatModel } from '@/src/lib/chat-models'
import {
  resolveOrCreateUserId,
  saveChatExchange,
} from '@/src/server/services/chat-session.service'
import { generateRagAnswer } from '@/src/server/services/rag-chat.service'
import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'

type ChatHistoryMessage = {
  role: 'user' | 'assistant'
  content: string
}

function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 })
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function parseHistory(value: unknown): ChatHistoryMessage[] | null {
  if (value == null) return []
  if (!Array.isArray(value)) return null

  const history: ChatHistoryMessage[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') return null
    const row = item as { role?: unknown; content?: unknown }
    if ((row.role !== 'user' && row.role !== 'assistant') || !isNonEmptyString(row.content)) {
      return null
    }

    history.push({
      role: row.role,
      content: row.content,
    })
  }

  return history
}

/**
 * @swagger
 * /api/chat:
 *   post:
 *     summary: RAG chat with vector search and Ollama response generation
 *     tags: [Chat]
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as unknown
  if (!body || typeof body !== 'object') {
    return badRequest('Invalid JSON body')
  }

  const { message, history, sessionId, modelName } = body as {
    message?: unknown
    history?: unknown
    sessionId?: unknown
    modelName?: unknown
  }

  if (!isNonEmptyString(message)) {
    return badRequest('message is required')
  }

  const parsedHistory = parseHistory(history)
  if (parsedHistory == null) {
    return badRequest('history must be an array of { role, content }')
  }

  const resolvedModelName = isSupportedChatModel(modelName) ? modelName : DEFAULT_CHAT_MODEL

  try {
    const session = await getServerSessionSafe()
    if (!session?.user?.email?.trim()) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const resolvedSessionId =
      typeof sessionId === 'string' && sessionId.trim() ? sessionId.trim() : null
    const userId = await resolveOrCreateUserId({
      email: session.user.email,
      name: session.user.name,
    })
    const startedAt = Date.now()
    const result = await generateRagAnswer(message, parsedHistory, resolvedModelName)
    const saved = await saveChatExchange({
      userId,
      sessionId: resolvedSessionId,
      userMessage: message.trim(),
      assistantMessage: result.answer,
      modelName: resolvedModelName,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      tokenCount: result.totalTokens,
      responseTimeMs: Date.now() - startedAt,
      sources: result.sources,
    })

    return Response.json({
      sessionId: saved.sessionId,
      modelName: result.modelName,
      answer: result.answer,
      sources: result.sources,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process chat request'
    return Response.json({ error: message }, { status: 500 })
  }
}
