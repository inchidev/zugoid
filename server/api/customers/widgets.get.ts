import { getServerId } from '../../../shared/server-id'
import type { CustomerWidgetDTO } from '../../../shared/types'
import { requireMember } from '../../utils/guards'
import { cf } from '../../utils/cf'
import { canManageWidgets, listCustomerWidgets } from '../../utils/customer-widgets'
import { primaryServerOrigin } from '../../utils/server-origins'

export default defineEventHandler(async (event): Promise<{ widgets: CustomerWidgetDTO[]; canManage: boolean }> => {
  const { env } = cf(event)
  const member = await requireMember(event, await getServerId(env.DB))
  return { widgets: await listCustomerWidgets(env, member, await primaryServerOrigin(env, getRequestURL(event).origin)), canManage: canManageWidgets(member) }
})
