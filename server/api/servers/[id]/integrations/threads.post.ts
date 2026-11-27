import { cf, fail, originOk } from '../../../../utils/cf'
import { requireMember } from '../../../../utils/guards'
import { requireIntegrationOwner } from '../../../../utils/integrations'
import { beginThreadsConnection, threadsAppInput } from '../../../../utils/threads-connection'
import { parseBody } from '../../../../utils/validate'

export default defineEventHandler(async event => {
  setHeader(event, 'Cache-Control', 'no-store')
  if (!await originOk(event)) fail(403, 'origin_denied', 'Connect Threads from the Server itself')
  const serverId = getRouterParam(event, 'id')!
  const member = await requireMember(event, serverId)
  requireIntegrationOwner(member)
  const app = parseBody(threadsAppInput, await readBody(event))
  const authorizationUrl = await beginThreadsConnection(cf(event).env, { serverId, userId: member.user.id }, getRequestURL(event).origin, app)
  return { authorizationUrl }
})
