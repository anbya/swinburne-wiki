import { pool } from '@/lib/db'
import { ensureWikiSchema } from '@/lib/wiki-schema'
import type { NextRequest } from 'next/server'

type CategoryRow = {
  id: string
  name: string
  parent_id: string | null
}

type CategoryNode = CategoryRow & { children: CategoryNode[] }

function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 })
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function buildTree(rows: CategoryRow[]): CategoryNode[] {
  const nodes = new Map<string, CategoryNode>()

  for (const row of rows) {
    nodes.set(row.id, { ...row, children: [] })
  }

  const roots: CategoryNode[] = []
  for (const node of nodes.values()) {
    const parentId = node.parent_id
    if (!parentId) {
      roots.push(node)
      continue
    }

    const parent = nodes.get(parentId)
    if (!parent) {
      roots.push(node)
      continue
    }

    parent.children.push(node)
  }

  const sortRec = (items: CategoryNode[]) => {
    items.sort((a, b) => a.name.localeCompare(b.name))
    for (const item of items) sortRec(item.children)
  }
  sortRec(roots)

  return roots
}

/**
 * @swagger
 * /api/categories:
 *   get:
 *     summary: Get all categories (flat list + tree)
 *     tags: [Categories]
 */
export async function GET() {
  await ensureWikiSchema()

  const result = await pool.query(
    'SELECT id::text, name, parent_id::text FROM categories ORDER BY name ASC, id ASC'
  )

  const rows = result.rows as CategoryRow[]
  return Response.json({
    data: rows,
    tree: buildTree(rows),
  })
}

/**
 * @swagger
 * /api/categories:
 *   post:
 *     summary: Create a category
 *     tags: [Categories]
 */
export async function POST(req: NextRequest) {
  await ensureWikiSchema()

  const body = (await req.json().catch(() => null)) as unknown
  if (!body || typeof body !== 'object') {
    return badRequest('Invalid JSON body')
  }

  const { name, parent_id } = body as {
    name?: unknown
    parent_id?: unknown
  }

  if (!isNonEmptyString(name)) return badRequest('name is required')
  if (parent_id != null && !isNonEmptyString(parent_id)) {
    return badRequest('parent_id must be a non-empty string')
  }

  const result = await pool.query(
    `INSERT INTO categories (name, parent_id)
     VALUES ($1, $2)
     RETURNING id::text, name, parent_id::text`,
    [name.trim(), parent_id == null ? null : parent_id.trim()]
  )

  return Response.json(result.rows[0], { status: 201 })
}
