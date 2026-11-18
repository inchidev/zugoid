import { getServerId } from '../../../shared/server-id'
import type { CustomerCompanyDTO } from '../../../shared/types'
import { requireMember } from '../../utils/guards'
import { cf } from '../../utils/cf'
import { listCustomerCompanies } from '../../utils/customers'

export default defineEventHandler(async (event): Promise<{ companies: CustomerCompanyDTO[] }> => {
  const { env } = cf(event)
  const member = await requireMember(event, await getServerId(env.DB))
  const search = getQuery(event).q
  return { companies: await listCustomerCompanies(env, member, { search: typeof search === 'string' ? search : null }) }
})
