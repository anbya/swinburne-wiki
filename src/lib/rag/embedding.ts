export const VECTOR_SIZE = 768

function buildZeroVector() {
  return new Array<number>(VECTOR_SIZE).fill(0)
}

function buildDeterministicEmbedding(text: string) {
  const vector = buildZeroVector()
  const normalized = text.trim().toLowerCase()
  if (!normalized) return vector

  for (let i = 0; i < normalized.length; i += 1) {
    const code = normalized.charCodeAt(i)
    const idx = i % VECTOR_SIZE
    vector[idx] += ((code % 31) - 15) / 100
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
  if (magnitude === 0) return vector

  return vector.map((value) => value / magnitude)
}

async function ollamaEmbedding(text: string) {
  const baseUrl = process.env.OLLAMA_BASE_URL?.trim() || 'http://localhost:11434'
  const model = process.env.OLLAMA_EMBEDDING_MODEL?.trim() || 'nomic-embed-text'
  if (!model) return null

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      prompt: text,
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    console.warn(`[embedding] Ollama error: ${response.status} ${body}`)
    return null
  }

  const json = (await response.json()) as {
    embedding?: number[]
  }

  const embedding = json.embedding
  if (!Array.isArray(embedding)) {
    console.warn('[embedding] Ollama returned invalid payload')
    return null
  }

  if (embedding.length !== VECTOR_SIZE) {
    console.warn(
      `[embedding] Ollama length mismatch. Expected ${VECTOR_SIZE}, got ${embedding.length}`
    )
    return null
  }

  return embedding
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const normalized = text.trim()
  if (!normalized) return buildZeroVector()

  // Try Ollama first (if configured)
  const ollamaResult = await ollamaEmbedding(normalized).catch(() => null)
  if (ollamaResult) return ollamaResult

  // Fall back to deterministic embedding
  return buildDeterministicEmbedding(normalized)
}
