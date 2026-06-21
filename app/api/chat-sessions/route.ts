import { getServerSessionSafe } from '@/lib/auth'
import {
  findUserIdByEmail,
  listChatSessionsByUserId,
} from '@/src/server/services/chat-session.service'

export async function GET() {
  const session = await getServerSessionSafe()
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const email = session.user?.email?.trim() ?? ''
  if (!email) {
    return Response.json({ data: [] })
  }

  const userId = await findUserIdByEmail(email)
  if (!userId) {
    return Response.json({ data: [] })
  }

  return Response.json({
    data: await listChatSessionsByUserId(userId),
  })
}
