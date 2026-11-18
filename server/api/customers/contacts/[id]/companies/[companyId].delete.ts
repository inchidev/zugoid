import { getServerId } from '../../../../../../shared/server-id'
import { requireMember } from '../../../../../utils/guards'
import { cf } from '../../../../../utils/cf'
import { removeContactCompany } from '../../../../../utils/customers'

export default defineEventHandler(async (event) => {
  const { env } = cf(event)
  const member = await requireMember(event, await getServerId(env.DB))
  await removeContactCompany(env, member, getRouterParam(event, 'id')!, getRouterParam(event, 'companyId')!)
  return { ok: true }
})
