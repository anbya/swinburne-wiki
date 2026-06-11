export type DocumentChunk = {
  chunkIndex: number
  content: string
}

const DEFAULT_CHUNK_SIZE = 1000
const DEFAULT_OVERLAP = 200

function normalizeText(content: string) {
  return content.replace(/\r\n?/g, '\n').trim()
}

function splitLongParagraph(paragraph: string, chunkSize: number, overlap: number): string[] {
  const result: string[] = []
  let start = 0

  while (start < paragraph.length) {
    const rawEnd = Math.min(start + chunkSize, paragraph.length)
    let end = rawEnd

    if (rawEnd < paragraph.length) {
      const nearestWhitespace = paragraph.lastIndexOf(' ', rawEnd)
      if (nearestWhitespace > start + Math.floor(chunkSize * 0.6)) {
        end = nearestWhitespace
      }
    }

    const part = paragraph.slice(start, end).trim()
    if (part) result.push(part)

    if (end >= paragraph.length) break
    start = Math.max(0, end - overlap)
  }

  return result
}

export function splitIntoChunks(content: string): DocumentChunk[] {
  const normalized = normalizeText(content)
  if (!normalized) return []

  const paragraphs = normalized
    .split(/\n\s*\n/g)
    .map((p) => p.trim())
    .filter(Boolean)

  if (paragraphs.length === 0) return []

  const baseChunks: string[] = []
  let current = ''

  for (const paragraph of paragraphs) {
    if (paragraph.length > DEFAULT_CHUNK_SIZE) {
      if (current.trim()) {
        baseChunks.push(current.trim())
        current = ''
      }

      const longParagraphParts = splitLongParagraph(
        paragraph,
        DEFAULT_CHUNK_SIZE,
        DEFAULT_OVERLAP
      )
      for (const part of longParagraphParts) {
        baseChunks.push(part)
      }
      continue
    }

    const candidate = current ? `${current}\n\n${paragraph}` : paragraph
    if (candidate.length <= DEFAULT_CHUNK_SIZE) {
      current = candidate
      continue
    }

    if (current.trim()) {
      baseChunks.push(current.trim())
    }
    current = paragraph
  }

  if (current.trim()) {
    baseChunks.push(current.trim())
  }

  const withOverlap = baseChunks.map((chunk, index) => {
    if (index === 0) return chunk

    const previous = baseChunks[index - 1]
    const tail = previous.slice(Math.max(0, previous.length - DEFAULT_OVERLAP)).trim()
    if (!tail) return chunk
    if (chunk.startsWith(tail)) return chunk

    const merged = `${tail}\n\n${chunk}`.trim()
    return merged.length > DEFAULT_CHUNK_SIZE + DEFAULT_OVERLAP
      ? merged.slice(0, DEFAULT_CHUNK_SIZE + DEFAULT_OVERLAP)
      : merged
  })

  return withOverlap.map((chunk, chunkIndex) => ({
    chunkIndex,
    content: chunk,
  }))
}
