import { pool } from '@/lib/db'

const SCHEMA_VERSION = 2

let schemaReady: { version: number; promise: Promise<void> } | null = null

export function ensureWikiSchema() {
  if (!schemaReady || schemaReady.version !== SCHEMA_VERSION) {
    const promise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS categories (
          id BIGSERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          parent_id BIGINT REFERENCES categories(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `)

      await pool.query(
        'CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id)'
      )

      await pool.query(`
        CREATE TABLE IF NOT EXISTS wiki_pages (
          id BIGSERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          content TEXT NOT NULL DEFAULT '',
          attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
          category_id BIGINT REFERENCES categories(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `)

      await pool.query(`
        ALTER TABLE wiki_pages
        ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;
      `)

      await pool.query(
        'CREATE INDEX IF NOT EXISTS idx_wiki_pages_category_id ON wiki_pages(category_id)'
      )
    })()

    schemaReady = { version: SCHEMA_VERSION, promise }
  }

  return schemaReady.promise
}
