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
  if (value === null) return [] as Attachment[]
  if (!Array.isArray(value)) return null
  const next: Attachment[] = []
  for (const item of value) {
    if (!isAttachment(item)) return null
    next.push(item)
  }
  return next
}

/**
 * @swagger
 * /api/wiki-pages/{id}:
 *   get:
 *     summary: Get wiki page by ID
 *     tags: [Wiki]
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureWikiSchema()

  const { id } = await params
  const result = await pool.query(
    `SELECT id::text, title, content, attachments, category_id::text, created_at, updated_at
     FROM wiki_pages
     WHERE id = $1`,
    [id]
  )

  const row = result.rows[0]
  if (!row) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json(row)
}

/**
 * @swagger
 * /api/wiki-pages/{id}:
 *   put:
 *     summary: Update wiki page by ID
 *     tags: [Wiki]
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureWikiSchema()

  const { id } = await params
  if (!isNonEmptyString(id)) return badRequest('id is required')

  const body = (await req.json().catch(() => null)) as unknown
  if (!body || typeof body !== 'object') {
    return badRequest('Invalid JSON body')
  }

  const parsed = body as Record<string, unknown>
  const hasTitle = Object.prototype.hasOwnProperty.call(parsed, 'title')
  const hasContent = Object.prototype.hasOwnProperty.call(parsed, 'content')
  const hasCategory = Object.prototype.hasOwnProperty.call(parsed, 'category_id')
  const hasAttachments = Object.prototype.hasOwnProperty.call(parsed, 'attachments')

  const title = parsed.title
  const content = parsed.content
  const category_id = parsed.category_id
  const attachments = parsed.attachments

  if (hasTitle) {
    if (!isNonEmptyString(title)) return badRequest('title must be a non-empty string')
  }

  if (hasContent) {
    if (!isString(content)) return badRequest('content must be a string')
  }

  if (hasCategory) {
    if (category_id !== null && category_id !== undefined && !isNonEmptyString(category_id)) {
      return badRequest('category_id must be a non-empty string or null')
    }
  }

  let attachmentsParsed: Attachment[] | null = null
  if (hasAttachments) {
    if (attachments === undefined) {
      // if explicitly present but undefined, treat as invalid
      return badRequest('attachments must be an array of {url,name,mime?,size?} or null')
    }
    attachmentsParsed = parseAttachments(attachments)
    if (attachmentsParsed == null) {
      return badRequest('attachments must be an array of {url,name,mime?,size?} or null')
    }
  }

  const setParts: string[] = ['updated_at = NOW()']
  const args: Array<unknown> = []

  if (hasTitle) {
    args.push((title as string).trim())
    setParts.push(`title = $${args.length}`)
  }

  if (hasContent) {
    args.push(content as string)
    setParts.push(`content = $${args.length}`)
  }

  if (hasCategory) {
    const next = category_id == null ? null : (category_id as string).trim()
    args.push(next)
    setParts.push(`category_id = $${args.length}`)
  }

  if (hasAttachments) {
    args.push(JSON.stringify(attachmentsParsed ?? []))
    setParts.push(`attachments = $${args.length}::jsonb`)
  }

  args.push(id.trim())
  const idIndex = args.length

  const result = await pool.query(
    `UPDATE wiki_pages
     SET ${setParts.join(', ')}
     WHERE id = $${idIndex}
     RETURNING id::text, title, content, attachments, category_id::text, created_at, updated_at`,
    args
  )

  const row = result.rows[0]
  if (!row) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json(row)
}

/**
 * @swagger
 * /api/wiki-pages/{id}:
 *   delete:
 *     summary: Delete wiki page by ID
 *     tags: [Wiki]
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureWikiSchema()

  const { id } = await params
  if (!isNonEmptyString(id)) return badRequest('id is required')

  const result = await pool.query(
    'DELETE FROM wiki_pages WHERE id = $1 RETURNING id::text',
    [id.trim()]
  )

  if (result.rowCount === 0) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  return Response.json({ message: 'Deleted' })
}
