import { getApiDocs } from '@/lib/swagger'

export const runtime = 'nodejs'

export async function GET() {
  return Response.json(getApiDocs())
}