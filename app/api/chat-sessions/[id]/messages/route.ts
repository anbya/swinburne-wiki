import { getServerSessionSafe } from '@/lib/auth'
import {
  findUserIdByEmail,
  getChatMessagesBySessionId,
} from '@/src/server/services/chat-session.service'

export async function GET(_req: Request, ctx: RouteContext<'/api/chat-sessions/[id]/messages'>) {
  const session = await getServerSessionSafe()
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const email = session.user?.email?.trim() ?? ''
  if (!email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = await findUserIdByEmail(email)
  if (!userId) {
    return Response.json({ error: 'Chat session not found' }, { status: 404 })
  }

  const { id } = await ctx.params
  const messages = await getChatMessagesBySessionId({
    sessionId: id,
    userId,
  })

  if (!messages) {
    return Response.json({ error: 'Chat session not found' }, { status: 404 })
  }

  return Response.json({ data: messages })
}
