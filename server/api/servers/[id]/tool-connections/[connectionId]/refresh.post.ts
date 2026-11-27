import { refreshMcpConnection } from '../../../../../utils/outbound-mcp'
import { requireMember } from '../../../../../utils/guards'
import { cf } from '../../../../../utils/cf'
import { STUDIO_MCP_KEY_HEADER } from '../../../../../../shared/outbound-mcp'
export default defineEventHandler(async event => {
  const actor = await requireMember(event, getRouterParam(event, 'id')!)
  return refreshMcpConnection(cf(event).env, actor.authorization, getRouterParam(event, 'connectionId')!, getRequestURL(event).origin, getHeader(event, STUDIO_MCP_KEY_HEADER))
})
