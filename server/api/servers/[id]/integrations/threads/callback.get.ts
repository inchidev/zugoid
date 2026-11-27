import { cf } from '../../../../../utils/cf'
import { requireMember } from '../../../../../utils/guards'
import { requireIntegrationOwner } from '../../../../../utils/integrations'
import { writeAudit } from '../../../../../utils/messages'
import { completeThreadsConnection } from '../../../../../utils/threads-connection'

export default defineEventHandler(async event => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  setHeader(event, 'Referrer-Policy', 'no-referrer')
  const serverId = getRouterParam(event, 'id')!
  const member = await requireMember(event, serverId)
  requireIntegrationOwner(member)
  const { env } = cf(event)
  const outcome = await completeThreadsConnection(env, { serverId, userId: member.user.id }, getRequestURL(event))
  if (outcome === 'connected') {
    await writeAudit(env, { serverId, actorId: member.user.id, action: 'server.integrations.update', targetType: 'server', targetId: serverId, meta: { changed: ['threads'] }, authorization: member.authorization })
  }
  return sendRedirect(event, `/server/${serverId}/settings?section=integrations&threads=${outcome}`, 303)
})
