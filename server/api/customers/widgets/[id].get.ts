import { getServerId } from '../../../../shared/server-id'
import { requireMember } from '../../../utils/guards'
import { cf } from '../../../utils/cf'
import { readCustomerWidget } from '../../../utils/customer-widgets'
import { primaryServerOrigin } from '../../../utils/server-origins'

export default defineEventHandler(async (event) => {
  const { env } = cf(event)
  const member = await requireMember(event, await getServerId(env.DB))
  return readCustomerWidget(env, member, getRouterParam(event, 'id')!, await primaryServerOrigin(env, getRequestURL(event).origin))
})
