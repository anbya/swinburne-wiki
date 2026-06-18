import { pool } from '@/lib/db'
import { generateEmbedding } from '@/src/lib/rag/embedding'

type ChatRole = 'user' | 'assistant'

type ChatHistoryMessage = {
  role: ChatRole
  content: string
}

type RetrievedChunk = {
  title: string
  content: string
  score: number
  sourceUrl: string | null
}

type ChatAnswer = {
  answer: string
  sources: Array<{ title: string; score: number }>
}

function toVectorLiteral(values: number[]) {
  return `[${values.join(',')}]`
}

async function retrieveRelevantChunks(query: string, limit = 5): Promise<RetrievedChunk[]> {
  const embedding = await generateEmbedding(query)
  const vector = toVectorLiteral(embedding)

  const result = await pool.query(
    `SELECT
       COALESCE(d.title, 'Untitled') AS title,
       dc.content,
       d.source_url,
       1 - (dc.embedding <=> $1::vector) AS score
     FROM document_chunks dc
     LEFT JOIN documents d ON d.id = dc.document_id
     WHERE dc.embedding IS NOT NULL
     ORDER BY dc.embedding <=> $1::vector
     LIMIT $2`,
    [vector, limit]
  )

  return result.rows.map((row) => ({
    title: String(row.title ?? 'Untitled'),
    content: String(row.content ?? ''),
    score: Number(row.score ?? 0),
    sourceUrl: typeof row.source_url === 'string' ? row.source_url : null,
  }))
}

function buildContextBlock(chunks: RetrievedChunk[]) {
  if (chunks.length === 0) return 'No document context was found.'

  return chunks
    .map((chunk, index) => {
      const snippet = chunk.content.replace(/\s+/g, ' ').trim()
      const shortSnippet = snippet.length > 700 ? `${snippet.slice(0, 700)}...` : snippet
      const sourceSuffix = chunk.sourceUrl ? ` (${chunk.sourceUrl})` : ''
      return `[${index + 1}] ${chunk.title}${sourceSuffix}\n${shortSnippet}`
    })
    .join('\n\n')
}

async function callOllamaChat(messages: Array<{ role: 'system' | ChatRole; content: string }>) {
  const baseUrl = process.env.OLLAMA_BASE_URL?.trim() || 'http://localhost:11434'
  const model = process.env.OLLAMA_CHAT_MODEL?.trim() || 'qwen3:14b'

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      stream: false,
      messages,
      options: {
        temperature: 0.2,
      },
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Ollama chat error ${response.status}: ${body}`)
  }

  const json = (await response.json()) as {
    message?: {
      content?: unknown
    }
  }

  const text = typeof json.message?.content === 'string' ? json.message.content.trim() : ''
  if (!text) {
    throw new Error('Ollama did not return chat content')
  }

  return text
}

export async function generateRagAnswer(
  message: string,
  history: ChatHistoryMessage[]
): Promise<ChatAnswer> {
  const normalizedQuestion = message.trim()
  if (!normalizedQuestion) throw new Error('message is required')

  const chunks = await retrieveRelevantChunks(normalizedQuestion, 5)
  const contextBlock = buildContextBlock(chunks)

  const safeHistory = history
    .filter((item) => (item.role === 'user' || item.role === 'assistant') && item.content.trim())
    .slice(-8)

  const systemPrompt = [
    'You are a campus assistant that must answer using the retrieved document context.',
    'If the information is not present in the context, clearly say that the data could not be found.',
    'Always answer in clear, concise English, even if the user asks in another language.',
  ].join(' ')

  const userPrompt = [
    `User question: ${normalizedQuestion}`,
    '',
    'Retrieved document context:',
    contextBlock,
    '',
    'Answer instructions:',
    '- Answer only from the relevant context.',
    '- If the context is insufficient, state the limitation clearly.',
    '- Write the final answer in English.',
  ].join('\n')

  const answer = await callOllamaChat([
    { role: 'system', content: systemPrompt },
    ...safeHistory,
    { role: 'user', content: userPrompt },
  ])

  return {
    answer,
    sources: chunks.slice(0, 3).map((chunk) => ({
      title: chunk.title,
      score: chunk.score,
    })),
  }
}
