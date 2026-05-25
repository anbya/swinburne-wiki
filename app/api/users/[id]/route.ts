import { pool } from '@/lib/db'
import type { NextRequest } from 'next/server'

function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 })
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     summary: Get user by ID
 *     tags: [Users]
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const result = await pool.query(
    `SELECT * FROM users WHERE id = $1`,
    [id]
  )

  const row = result.rows[0]
  if (!row) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json(row)
}

/**
 * @swagger
 * /api/users/{id}:
 *   put:
 *     summary: Update user by ID
 *     tags: [Users]
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!id) return badRequest('id is required')

  const body = (await req.json().catch(() => null)) as unknown
  if (!body || typeof body !== 'object') {
    return badRequest('Invalid JSON body')
  }

  const { name, email, role } = body as {
    name?: unknown
    email?: unknown
    role?: unknown
  }

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
      id,
    ]
  )

  const row = result.rows[0]
  if (!row) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json(row)
}

/**
 * @swagger
 * /api/users/{id}:
 *   delete:
 *     summary: Delete user by ID
 *     tags: [Users]
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!id) return badRequest('id is required')

  const result = await pool.query(`DELETE FROM users WHERE id=$1 RETURNING id`, [
    id,
  ])

  if (result.rowCount === 0) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  return Response.json({ message: 'Deleted' })
}