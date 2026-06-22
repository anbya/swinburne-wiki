import { pool } from '@/lib/db'
import { DEFAULT_CHAT_MODEL } from '@/src/lib/chat-models'
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
  sourceType: string | null
}

export type ChatSource = {
  title: string
  score: number
  sourceUrl: string | null
  sourceType: string | null
}

type ChatAnswer = {
  answer: string
  sources: ChatSource[]
  promptTokens?: number | null
  completionTokens?: number | null
  totalTokens?: number | null
  modelName: string
}

function toVectorLiteral(values: number[]) {
  return `[${values.join(',')}]`
}

const DEFAULT_MAX_DOCUMENTS = 3
const DEFAULT_MAX_CHUNKS_PER_DOCUMENT = 2

async function retrieveRelevantChunks(
  query: string,
  options?: {
    maxDocuments?: number
    maxChunksPerDocument?: number
  }
): Promise<RetrievedChunk[]> {
  const embedding = await generateEmbedding(query)
  const vector = toVectorLiteral(embedding)
  const maxDocuments = Math.max(1, options?.maxDocuments ?? DEFAULT_MAX_DOCUMENTS)
  const maxChunksPerDocument = Math.max(
    1,
    options?.maxChunksPerDocument ?? DEFAULT_MAX_CHUNKS_PER_DOCUMENT
  )

  const result = await pool.query(
    `WITH scored_chunks AS (
       SELECT
         dc.document_id,
         dc.chunk_index,
         dc.content,
         COALESCE(d.title, 'Untitled') AS title,
         d.source_type,
         d.source_url,
         dc.embedding <=> $1::vector AS distance
       FROM document_chunks dc
       LEFT JOIN documents d ON d.id = dc.document_id
       WHERE dc.embedding IS NOT NULL
     ),
     top_documents AS (
       SELECT
         document_id,
         MIN(distance) AS best_distance
       FROM scored_chunks
       GROUP BY document_id
       ORDER BY best_distance ASC
       LIMIT $2
     ),
     ranked_chunks AS (
       SELECT
         sc.title,
         sc.content,
         sc.source_type,
         sc.source_url,
         sc.distance,
         td.best_distance,
         ROW_NUMBER() OVER (
           PARTITION BY sc.document_id
           ORDER BY sc.distance ASC, sc.chunk_index ASC
         ) AS chunk_rank
       FROM scored_chunks sc
       INNER JOIN top_documents td ON td.document_id = sc.document_id
     )
     SELECT
       title,
       content,
       source_type,
       source_url,
       1 - distance AS score
     FROM ranked_chunks
     WHERE chunk_rank <= $3
     ORDER BY best_distance ASC, distance ASC, title ASC`,
    [vector, maxDocuments, maxChunksPerDocument]
  )

  return result.rows.map((row) => ({
    title: String(row.title ?? 'Untitled'),
    content: String(row.content ?? ''),
    score: Number(row.score ?? 0),
    sourceUrl: typeof row.source_url === 'string' ? row.source_url : null,
    sourceType: typeof row.source_type === 'string' ? row.source_type : null,
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

function buildSources(chunks: RetrievedChunk[]): ChatSource[] {
  const uniqueSources = new Map<string, ChatSource>()

  for (const chunk of chunks) {
    const sourceKey = `${chunk.title}::${chunk.sourceUrl ?? ''}::${chunk.sourceType ?? ''}`
    const existing = uniqueSources.get(sourceKey)

    if (!existing || chunk.score > existing.score) {
      uniqueSources.set(sourceKey, {
        title: chunk.title,
        score: chunk.score,
        sourceUrl: chunk.sourceUrl,
        sourceType: chunk.sourceType,
      })
    }
  }

  return [...uniqueSources.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
}

async function callOllamaChat(
  messages: Array<{ role: 'system' | ChatRole; content: string }>,
  modelName?: string | null
) {
  const baseUrl = process.env.OLLAMA_BASE_URL?.trim() || 'http://localhost:11434'
  const model = getConfiguredChatModelName(modelName)

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
    prompt_eval_count?: unknown
    eval_count?: unknown
    message?: {
      content?: unknown
    }
  }

  const text = typeof json.message?.content === 'string' ? json.message.content.trim() : ''
  if (!text) {
    throw new Error('Ollama did not return chat content')
  }

  return {
    text,
    model,
    promptTokens:
      typeof json.prompt_eval_count === 'number' ? json.prompt_eval_count : null,
    completionTokens: typeof json.eval_count === 'number' ? json.eval_count : null,
  }
}

export function getConfiguredChatModelName(modelName?: string | null) {
  const selectedModel = modelName?.trim() ?? ''
  if (selectedModel) return selectedModel

  return process.env.OLLAMA_CHAT_MODEL?.trim() || DEFAULT_CHAT_MODEL
}

export async function generateRagAnswer(
  message: string,
  history: ChatHistoryMessage[],
  modelName?: string | null
): Promise<ChatAnswer> {
  const normalizedQuestion = message.trim()
  if (!normalizedQuestion) throw new Error('message is required')

  const chunks = await retrieveRelevantChunks(normalizedQuestion, {
    maxDocuments: 3,
    maxChunksPerDocument: 2,
  })
  const contextBlock = buildContextBlock(chunks)

  const safeHistory = history
    .filter((item) => (item.role === 'user' || item.role === 'assistant') && item.content.trim())
    .slice(-8)

  const systemPrompt = [
    'You are a campus assistant that must answer using the retrieved document context.',
    'If the information is not present in the context, clearly say that the data could not be found.',
    'Always answer in clear, concise English, even if the user asks in another language.',
    'When you use retrieved information, mention which source document it came from.',
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

  const response = await callOllamaChat([
    { role: 'system', content: systemPrompt },
    ...safeHistory,
    { role: 'user', content: userPrompt },
  ], modelName)

  return {
    answer: response.text,
    sources: buildSources(chunks),
    promptTokens: response.promptTokens,
    completionTokens: response.completionTokens,
    totalTokens:
      (response.promptTokens ?? 0) + (response.completionTokens ?? 0) || null,
    modelName: response.model,
  }
}
