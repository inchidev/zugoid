import { z } from 'zod'
import { getServerId } from '../../../../shared/server-id'
import { requireMember } from '../../../utils/guards'
import { cf } from '../../../utils/cf'
import { updateCustomerContact } from '../../../utils/customers'
import { parseBody } from '../../../utils/validate'

const schema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  ownerId: z.string().trim().min(1).max(80).nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const { env } = cf(event)
  const member = await requireMember(event, await getServerId(env.DB))
  await updateCustomerContact(env, member, getRouterParam(event, 'id')!, parseBody(schema, await readBody(event)))
  return { ok: true }
})
