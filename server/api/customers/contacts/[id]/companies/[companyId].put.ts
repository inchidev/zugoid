import { z } from 'zod'
import { getServerId } from '../../../../../../shared/server-id'
import { requireMember } from '../../../../../utils/guards'
import { cf } from '../../../../../utils/cf'
import { setContactCompany } from '../../../../../utils/customers'
import { parseBody } from '../../../../../utils/validate'

const schema = z.object({ title: z.string().trim().max(200).optional(), current: z.boolean().optional() })

export default defineEventHandler(async (event) => {
  const { env } = cf(event)
  const member = await requireMember(event, await getServerId(env.DB))
  await setContactCompany(env, member, getRouterParam(event, 'id')!, getRouterParam(event, 'companyId')!, parseBody(schema, await readBody(event) ?? {}))
  return { ok: true }
})
