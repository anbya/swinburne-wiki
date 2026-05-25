import { randomUUID } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'

export const runtime = 'nodejs'

function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 })
}

function asSafeExtension(filename: string, mime: string) {
  const ext = path.extname(filename || '').toLowerCase()
  if (ext && /^[a-z0-9.]{1,10}$/.test(ext)) return ext

  if (mime === 'image/png') return '.png'
  if (mime === 'image/jpeg') return '.jpg'
  if (mime === 'image/webp') return '.webp'
  if (mime === 'image/gif') return '.gif'
  if (mime === 'application/pdf') return '.pdf'

  return ''
}

/**
 * @swagger
 * /api/uploads:
 *   post:
 *     summary: Upload a file for wiki rich content
 *     tags: [Uploads]
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null)
  if (!form) return badRequest('Invalid form data')

  const file = form.get('file')
  if (!(file instanceof File)) return badRequest('file is required')

  const maxBytes = 10 * 1024 * 1024
  if (file.size <= 0) return badRequest('file is empty')
  if (file.size > maxBytes) return badRequest('file is too large (max 10MB)')

  const mime = file.type || 'application/octet-stream'
  const ext = asSafeExtension(file.name, mime)

  const now = new Date()
  const yyyy = String(now.getFullYear())
  const mm = String(now.getMonth() + 1).padStart(2, '0')

  const filename = `${randomUUID()}${ext}`
  const relDir = path.join('uploads', yyyy, mm)
  const absDir = path.join(process.cwd(), 'public', relDir)
  const absPath = path.join(absDir, filename)

  await mkdir(absDir, { recursive: true })

  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(absPath, buffer)

  const urlPath = `/uploads/${yyyy}/${mm}/${filename}`

  return Response.json({
    url: urlPath,
    name: file.name,
    mime,
    size: file.size,
  })
}
