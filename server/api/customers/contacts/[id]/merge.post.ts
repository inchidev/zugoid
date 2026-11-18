import { z } from 'zod'
import { getServerId } from '../../../../../shared/server-id'
import { requireMember } from '../../../../utils/guards'
import { cf } from '../../../../utils/cf'
import { mergeCustomerContacts } from '../../../../utils/customers'
import { parseBody } from '../../../../utils/validate'

const schema = z.object({ into: z.string().trim().min(1).max(80) })

/** Joins this Contact into another one: its addresses, Conversations and Companies move there. */
export default defineEventHandler(async (event) => {
  const { env } = cf(event)
  const member = await requireMember(event, await getServerId(env.DB))
  return mergeCustomerContacts(env, member, getRouterParam(event, 'id')!, parseBody(schema, await readBody(event)).into)
})
