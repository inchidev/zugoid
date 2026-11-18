import { getServerId } from '../../../../shared/server-id'
import type { CustomerContactDTO, CustomerConversationDTO } from '../../../../shared/types'
import { requireMember } from '../../../utils/guards'
import { cf } from '../../../utils/cf'
import { readCustomerContact } from '../../../utils/customers'

export default defineEventHandler(async (event): Promise<{ contact: CustomerContactDTO; conversations: CustomerConversationDTO[] }> => {
  const { env } = cf(event)
  const member = await requireMember(event, await getServerId(env.DB))
  return readCustomerContact(env, member, getRouterParam(event, 'id')!)
})
