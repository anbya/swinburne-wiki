import { pool } from '@/lib/db'
import { splitIntoChunks } from '@/src/lib/rag/chunker'
import { generateEmbedding, VECTOR_SIZE } from '@/src/lib/rag/embedding'

type CreateDocumentInput = {
  title: string
  category?: string | null
  content: string
}

type WikiPageDocumentSource = {
  wikiPageId: string
  title: string
  content: string
  category: string
}

const DOCUMENT_SCHEMA_VERSION = 2

let schemaReady: { version: number; promise: Promise<void> } | null = null

function slugify(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

async function ensureDocumentSchema() {
  if (!schemaReady || schemaReady.version !== DOCUMENT_SCHEMA_VERSION) {
    schemaReady = {
      version: DOCUMENT_SCHEMA_VERSION,
      promise: (async () => {
        await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;')
        await pool.query('CREATE EXTENSION IF NOT EXISTS vector;')

        await pool.query(`
          CREATE TABLE IF NOT EXISTS documents (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            title VARCHAR(500) NOT NULL,
            slug VARCHAR(500) UNIQUE,
            source_type VARCHAR(50),
            source_url TEXT,
            category VARCHAR(100),
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          );
        `)

        await pool.query(`
          CREATE TABLE IF NOT EXISTS document_chunks (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            chunk_index INTEGER NOT NULL,
            content TEXT NOT NULL,
            metadata JSONB,
            embedding VECTOR(${VECTOR_SIZE}),
            created_at TIMESTAMP DEFAULT NOW()
          );
        `)

        await pool.query(`
          ALTER TABLE document_chunks
          ALTER COLUMN embedding TYPE VECTOR(${VECTOR_SIZE})
          USING NULL::vector(${VECTOR_SIZE});
        `)

        if (VECTOR_SIZE > 2000) {
          const ivfflatIndexes = await pool.query(
            `SELECT indexname
             FROM pg_indexes
             WHERE schemaname = 'public'
               AND tablename = 'document_chunks'
               AND indexdef ILIKE '%USING ivfflat%'
               AND indexdef ILIKE '%(embedding %'`
          )

          for (const row of ivfflatIndexes.rows as Array<{ indexname: string }>) {
            const escapedName = row.indexname.replace(/"/g, '""')
            await pool.query(`DROP INDEX IF EXISTS public."${escapedName}"`)
          }
        } else {
          await pool.query(
            'CREATE INDEX IF NOT EXISTS document_chunks_embedding_hnsw ON document_chunks USING hnsw (embedding vector_cosine_ops)'
          )
        }

        await pool.query(
          'CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks(document_id);'
        )
      })(),
    }
  }

  await schemaReady.promise
}

async function ensureUniqueSlug(
  client: { query: typeof pool.query },
  baseSlug: string,
  excludeDocumentId?: string
) {
  let slug = baseSlug || 'document'
  let suffix = 1

  while (true) {
    const existing = await client.query(
      `SELECT id::text
       FROM documents
       WHERE slug = $1
         AND ($2::uuid IS NULL OR id <> $2::uuid)
       LIMIT 1`,
      [slug, excludeDocumentId ?? null]
    )

    if (existing.rowCount === 0) return slug

    suffix += 1
    slug = `${baseSlug || 'document'}-${suffix}`
  }
}

function toVectorLiteral(values: number[]) {
  return `[${values.join(',')}]`
}

function pickSection(content: string) {
  const firstLine = content
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0)

  return firstLine ? firstLine.slice(0, 120) : 'section'
}

async function replaceDocumentChunks(
  client: { query: typeof pool.query },
  documentId: string,
  content: string,
  sourceType?: string
) {
  const normalizedContent = content.trim()

  await client.query('DELETE FROM document_chunks WHERE document_id = $1', [documentId])

  if (!normalizedContent) return

  const chunks = splitIntoChunks(normalizedContent)
  if (chunks.length === 0) return

  const embeddings = await Promise.all(chunks.map((chunk) => generateEmbedding(chunk.content)))

  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i]
    const embedding = embeddings[i]
    const metadata = {
      section: pickSection(chunk.content),
      chunk: chunk.chunkIndex,
      ...(sourceType ? { sourceType } : {}),
    }

    await client.query(
      `INSERT INTO document_chunks (document_id, chunk_index, content, metadata, embedding)
       VALUES ($1, $2, $3, $4::jsonb, $5::vector)`,
      [
        documentId,
        chunk.chunkIndex,
        chunk.content,
        JSON.stringify(metadata),
        toVectorLiteral(embedding),
      ]
    )
  }
}

export async function createDocument(input: CreateDocumentInput): Promise<string> {
  const title = input.title.trim()
  const category = input.category?.trim() ?? ''
  const content = input.content.trim()

  if (!title) throw new Error('title is required')
  if (!category) throw new Error('category is required')
  if (!content) throw new Error('content is required')

  await ensureDocumentSchema()

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const slug = await ensureUniqueSlug(client, slugify(title))
    const insertDocumentResult = await client.query(
      `INSERT INTO documents (title, slug, source_type, category)
       VALUES ($1, $2, $3, $4)
       RETURNING id::text`,
      [title, slug, 'manual', category]
    )

    const documentId = insertDocumentResult.rows[0]?.id as string | undefined
    if (!documentId) {
      throw new Error('failed to create document')
    }

    await replaceDocumentChunks(client, documentId, content)

    await client.query('COMMIT')
    return documentId
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function syncWikiPageDocument(input: WikiPageDocumentSource): Promise<string> {
  const wikiPageId = input.wikiPageId.trim()
  const title = input.title.trim()
  const content = input.content.trim()
  const category = input.category.trim()

  if (!wikiPageId) throw new Error('wikiPageId is required')
  if (!title) throw new Error('title is required')

  await ensureDocumentSchema()

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const sourceType = 'wiki_page'
    const sourceUrl = `/wiki/${wikiPageId}`
    const existingResult = await client.query(
      `SELECT id::text
       FROM documents
       WHERE source_type = $1 AND source_url = $2
       LIMIT 1`,
      [sourceType, sourceUrl]
    )

    const existingDocumentId = existingResult.rows[0]?.id as string | undefined
    const slug = await ensureUniqueSlug(client, slugify(title || wikiPageId), existingDocumentId)

    let documentId = existingDocumentId

    if (documentId) {
      const updateResult = await client.query(
        `UPDATE documents
         SET title = $1,
             slug = $2,
             source_type = $3,
             source_url = $4,
             category = $5,
             updated_at = NOW()
         WHERE id = $6
         RETURNING id::text`,
        [title, slug, sourceType, sourceUrl, category || null, documentId]
      )

      documentId = updateResult.rows[0]?.id as string | undefined
    } else {
      const insertResult = await client.query(
        `INSERT INTO documents (title, slug, source_type, source_url, category)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id::text`,
        [title, slug, sourceType, sourceUrl, category || null]
      )

      documentId = insertResult.rows[0]?.id as string | undefined
    }

    if (!documentId) {
      throw new Error('failed to sync wiki page document')
    }

    await replaceDocumentChunks(client, documentId, content, sourceType)

    await client.query('COMMIT')
    return documentId
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
