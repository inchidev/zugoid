import { getServerId } from '../../../../shared/server-id'
import type { CustomerConversationDetailDTO } from '../../../../shared/types'
import { requireMember } from '../../../utils/guards'
import { cf } from '../../../utils/cf'
import { readCustomerConversation } from '../../../utils/customer-widgets'

export default defineEventHandler(async (event): Promise<CustomerConversationDetailDTO> => {
  const { env } = cf(event)
  const member = await requireMember(event, await getServerId(env.DB))
  return readCustomerConversation(env, member, getRouterParam(event, 'id')!)
})
