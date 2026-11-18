import { getServerId } from '../../../../shared/server-id'
import { requireMember } from '../../../utils/guards'
import { cf } from '../../../utils/cf'
import { deleteCustomerCompany } from '../../../utils/customers'

export default defineEventHandler(async (event) => {
  const { env } = cf(event)
  const member = await requireMember(event, await getServerId(env.DB))
  await deleteCustomerCompany(env, member, getRouterParam(event, 'id')!)
  return { ok: true }
})
