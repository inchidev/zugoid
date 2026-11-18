import { Permission } from '../../../../shared/permissions'
import { cf } from '../../../utils/cf'
import { requireMember } from '../../../utils/guards'
import { readServerTheme } from '../../../utils/server-theme'

export default defineEventHandler(async (event) => {
  await requireMember(event, getRouterParam(event, 'id')!, Permission.manageServer)
  return { theme: await readServerTheme(cf(event).env.DB) }
})
