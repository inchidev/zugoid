import { updateManagedMcp } from '../../../../utils/outbound-mcp'
import { requireMember } from '../../../../utils/guards'
import { cf } from '../../../../utils/cf'
import { STUDIO_MCP_KEY_HEADER } from '../../../../../shared/outbound-mcp'

export default defineEventHandler(async (event) => {
  const actor = await requireMember(event, getRouterParam(event, 'id')!)
  const id = getRouterParam(event, 'connectionId')!
  const connection = await updateManagedMcp(cf(event).env, actor.authorization, id, await readBody(event), getHeader(event, STUDIO_MCP_KEY_HEADER))
  return { connection }
})
