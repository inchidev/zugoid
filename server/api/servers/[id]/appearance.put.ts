import { Permission } from '../../../../shared/permissions'
import { cf } from '../../../utils/cf'
import { requireMember } from '../../../utils/guards'
import { saveServerTheme } from '../../../utils/server-theme'

export default defineEventHandler(async (event) => {
  const actor = await requireMember(event, getRouterParam(event, 'id')!, Permission.manageServer)
  return { theme: await saveServerTheme(cf(event).env, actor.authorization, await readBody(event)) }
})
