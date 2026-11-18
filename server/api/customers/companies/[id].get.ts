import { getServerId } from '../../../../shared/server-id'
import type { CustomerCompanyDTO, CustomerContactDTO } from '../../../../shared/types'
import { requireMember } from '../../../utils/guards'
import { cf } from '../../../utils/cf'
import { readCustomerCompany } from '../../../utils/customers'

export default defineEventHandler(async (event): Promise<{ company: CustomerCompanyDTO; contacts: CustomerContactDTO[] }> => {
  const { env } = cf(event)
  const member = await requireMember(event, await getServerId(env.DB))
  return readCustomerCompany(env, member, getRouterParam(event, 'id')!)
})
