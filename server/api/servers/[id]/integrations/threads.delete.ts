import { cf, fail, originOk } from '../../../../utils/cf'
import { requireMember } from '../../../../utils/guards'
import { requireIntegrationOwner } from '../../../../utils/integrations'
import { writeAudit } from '../../../../utils/messages'
import { disconnectThreads } from '../../../../utils/threads-connection'

export default defineEventHandler(async event => {
  setHeader(event, 'Cache-Control', 'no-store')
  if (!await originOk(event)) fail(403, 'origin_denied', 'Disconnect Threads from the Server itself')
  const serverId = getRouterParam(event, 'id')!
  const member = await requireMember(event, serverId)
  requireIntegrationOwner(member)
  const { env } = cf(event)
  await disconnectThreads(env)
  await writeAudit(env, { serverId, actorId: member.user.id, action: 'server.integrations.update', targetType: 'server', targetId: serverId, meta: { changed: ['threads'] }, authorization: member.authorization })
  return { ok: true }
})
