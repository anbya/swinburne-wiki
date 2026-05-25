import { pool } from '@/lib/db'
import type { NextRequest } from 'next/server'

function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 })
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
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
 * /api/users:
 *   get:
 *     summary: Get all users
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: List users
 */
export async function GET(req: NextRequest) {
  const pageParam = req.nextUrl.searchParams.get('page')
  const pageSizeParam = req.nextUrl.searchParams.get('pageSize')
  const qParam = req.nextUrl.searchParams.get('q')

  const wantsPaging = pageParam != null || pageSizeParam != null || qParam != null
  const pageSize = Math.min(parsePositiveInt(pageSizeParam, 10), 100)
  const page = parsePositiveInt(pageParam, 1)

  const q = (qParam ?? '').trim()
  const hasQ = q.length > 0
  const whereSql = hasQ
    ? 'WHERE name ILIKE $1 OR email ILIKE $1 OR role ILIKE $1 OR id::text ILIKE $1'
    : ''
  const qValue = `%${q}%`

  if (!wantsPaging) {
    const result = await pool.query('SELECT * FROM users ORDER BY id DESC')
    return Response.json(result.rows)
  }

  const countResult = hasQ
    ? await pool.query(`SELECT COUNT(*)::int AS total FROM users ${whereSql}`, [qValue])
    : await pool.query('SELECT COUNT(*)::int AS total FROM users')

  const total = Number(countResult.rows[0]?.total ?? 0)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(page, 1), totalPages)
  const safeOffset = (safePage - 1) * pageSize

  const dataResult = hasQ
    ? await pool.query(
        `SELECT * FROM users
         ${whereSql}
         ORDER BY id DESC
         LIMIT $2 OFFSET $3`,
        [qValue, pageSize, safeOffset]
      )
    : await pool.query(
        `SELECT * FROM users
         ORDER BY id DESC
         LIMIT $1 OFFSET $2`,
        [pageSize, safeOffset]
      )

  return Response.json({
    data: dataResult.rows,
    meta: {
      page: safePage,
      pageSize,
      total,
      totalPages,
      q: q || null,
    },
  })
}

/**
 * @swagger
 * /api/users:
 *   post:
 *     summary: Create user
 *     tags: [Users]
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as unknown
  if (!body || typeof body !== 'object') {
    return badRequest('Invalid JSON body')
  }
  const { name, email, role } = body as {
    name?: unknown
    email?: unknown
    role?: unknown
  }

  if (!isNonEmptyString(name)) return badRequest('name is required')
  if (!isNonEmptyString(email)) return badRequest('email is required')
  if (role != null && !isNonEmptyString(role)) {
    return badRequest('role must be a non-empty string')
  }

  const result = await pool.query(
    `INSERT INTO users (name,email,role) VALUES ($1,$2,$3) RETURNING *`,
    [name.trim(), email.trim(), role ?? null]
  )

  return Response.json(result.rows[0], { status: 201 })
}

/**
 * @swagger
 * /api/users:
 *   put:
 *     summary: Update user
 *     tags: [Users]
 */
// Backward-compatible update endpoint (prefer PUT /api/users/:id)
export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as unknown
  if (!body || typeof body !== 'object') {
    return badRequest('Invalid JSON body')
  }
  const { id, name, email, role } = body as {
    id?: unknown
    name?: unknown
    email?: unknown
    role?: unknown
  }

  if (!isNonEmptyString(id)) return badRequest('id is required')
  if (name != null && !isNonEmptyString(name)) {
    return badRequest('name must be a non-empty string')
  }
  if (email != null && !isNonEmptyString(email)) {
    return badRequest('email must be a non-empty string')
  }
  if (role != null && !isNonEmptyString(role)) {
    return badRequest('role must be a non-empty string')
  }

  const result = await pool.query(
    `UPDATE users
     SET name = COALESCE($1, name),
         email = COALESCE($2, email),
         role = COALESCE($3, role)
     WHERE id = $4
     RETURNING *`,
    [
      name == null ? null : (name as string).trim(),
      email == null ? null : (email as string).trim(),
      role == null ? null : (role as string).trim(),
      (id as string).trim(),
    ]
  )

  const row = result.rows[0]
  if (!row) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json(row)
}

/**
 * @swagger
 * /api/users:
 *   delete:
 *     summary: Delete user
 *     tags: [Users]
 */
// Backward-compatible delete endpoint (prefer DELETE /api/users/:id)
export async function DELETE(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as unknown
  if (!body || typeof body !== 'object') {
    return badRequest('Invalid JSON body')
  }
  const { id } = body as { id?: unknown }
  if (!isNonEmptyString(id)) return badRequest('id is required')

  const result = await pool.query(`DELETE FROM users WHERE id=$1 RETURNING id`, [
    (id as string).trim(),
  ])

  if (result.rowCount === 0) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  return Response.json({ message: 'Deleted' })
}