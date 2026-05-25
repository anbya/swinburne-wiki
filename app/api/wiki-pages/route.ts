import { pool } from '@/lib/db'
import { ensureWikiSchema } from '@/lib/wiki-schema'
import type { NextRequest } from 'next/server'

function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 })
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

type Attachment = {
  url: string
  name: string
  mime?: string
  size?: number
}

function isAttachment(value: unknown): value is Attachment {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (!isNonEmptyString(v.url)) return false
  if (!isNonEmptyString(v.name)) return false
  if (v.mime != null && typeof v.mime !== 'string') return false
  if (v.size != null && typeof v.size !== 'number') return false
  return true
}

function parseAttachments(value: unknown) {
  if (value == null) return [] as Attachment[]
  if (!Array.isArray(value)) return null
  const next: Attachment[] = []
  for (const item of value) {
    if (!isAttachment(item)) return null
    next.push(item)
  }
  return next
}

function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) return fallback
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  const i = Math.floor(n)
  if (i <= 0) return fallback
  return i
}

/**
 * @swagger
 * /api/wiki-pages:
 *   get:
 *     summary: Get wiki pages
 *     tags: [Wiki]
 */
export async function GET(req: NextRequest) {
  await ensureWikiSchema()

  const pageParam = req.nextUrl.searchParams.get('page')
  const pageSizeParam = req.nextUrl.searchParams.get('pageSize')
  const qParam = req.nextUrl.searchParams.get('q')
  const categoryIdParam = req.nextUrl.searchParams.get('categoryId')

  const wantsPaging =
    pageParam != null || pageSizeParam != null || qParam != null || categoryIdParam != null

  const pageSize = Math.min(parsePositiveInt(pageSizeParam, 10), 100)
  const page = parsePositiveInt(pageParam, 1)

  const q = (qParam ?? '').trim()
  const hasQ = q.length > 0

  const categoryId = (categoryIdParam ?? '').trim()
  const hasCategoryId = categoryId.length > 0

  const whereParts: string[] = []
  const args: Array<string | number | null> = []

  if (hasQ) {
    args.push(`%${q}%`)
    whereParts.push(`(title ILIKE $${args.length} OR content ILIKE $${args.length})`)
  }

  if (hasCategoryId) {
    args.push(categoryId)
    whereParts.push(`category_id::text = $${args.length}`)
  }

  const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : ''

  if (!wantsPaging) {
    const result = await pool.query(
      `SELECT id::text, title, content, attachments, category_id::text, created_at, updated_at
       FROM wiki_pages
       ${whereSql}
       ORDER BY updated_at DESC, id DESC`,
      args
    )

    return Response.json(result.rows)
  }

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM wiki_pages ${whereSql}`,
    args
  )

  const total = Number(countResult.rows[0]?.total ?? 0)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(page, 1), totalPages)
  const safeOffset = (safePage - 1) * pageSize

  const dataArgs = [...args, pageSize, safeOffset]
  const limitIndex = dataArgs.length - 1
  const offsetIndex = dataArgs.length

  const dataResult = await pool.query(
    `SELECT id::text, title, content, attachments, category_id::text, created_at, updated_at
     FROM wiki_pages
     ${whereSql}
     ORDER BY updated_at DESC, id DESC
     LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    dataArgs
  )

  return Response.json({
    data: dataResult.rows,
    meta: {
      page: safePage,
      pageSize,
      total,
      totalPages,
      q: q || null,
      categoryId: categoryId || null,
    },
  })
}

/**
 * @swagger
 * /api/wiki-pages:
 *   post:
 *     summary: Create a wiki page
 *     tags: [Wiki]
 */
export async function POST(req: NextRequest) {
  await ensureWikiSchema()

  const body = (await req.json().catch(() => null)) as unknown
  if (!body || typeof body !== 'object') {
    return badRequest('Invalid JSON body')
  }

  const { title, content, category_id } = body as {
    title?: unknown
    content?: unknown
    category_id?: unknown
    attachments?: unknown
  }

  const attachmentsParsed = parseAttachments((body as { attachments?: unknown }).attachments)
  if (attachmentsParsed == null) {
    return badRequest('attachments must be an array of {url,name,mime?,size?}')
  }

  if (!isNonEmptyString(title)) return badRequest('title is required')
  if (content != null && !isString(content)) {
    return badRequest('content must be a string')
  }
  if (category_id != null && !isNonEmptyString(category_id)) {
    return badRequest('category_id must be a non-empty string')
  }

  const result = await pool.query(
    `INSERT INTO wiki_pages (title, content, category_id, attachments)
     VALUES ($1, $2, $3, $4::jsonb)
     RETURNING id::text, title, content, attachments, category_id::text, created_at, updated_at`,
    [
      title.trim(),
      content == null ? '' : content,
      category_id ?? null,
      JSON.stringify(attachmentsParsed),
    ]
  )

  return Response.json(result.rows[0], { status: 201 })
}
