import { getServerId } from '../../../shared/server-id'
import type { CustomerContactDTO } from '../../../shared/types'
import { requireMember } from '../../utils/guards'
import { cf } from '../../utils/cf'
import { listCustomerContacts } from '../../utils/customers'

export default defineEventHandler(async (event): Promise<{ contacts: CustomerContactDTO[] }> => {
  const { env } = cf(event)
  const member = await requireMember(event, await getServerId(env.DB))
  const search = getQuery(event).q
  return { contacts: await listCustomerContacts(env, member, { search: typeof search === 'string' ? search : null }) }
})
