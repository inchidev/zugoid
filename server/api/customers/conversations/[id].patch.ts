import { z } from 'zod'
import { getServerId } from '../../../../shared/server-id'
import { requireMember } from '../../../utils/guards'
import { cf } from '../../../utils/cf'
import { updateCustomerConversation } from '../../../utils/customer-widgets'
import { parseBody } from '../../../utils/validate'

const schema = z.object({
  status: z.enum(['open', 'waiting', 'resolved', 'spam', 'trash']).optional(),
  assigneeId: z.string().trim().min(1).max(80).nullable().optional(),
})

/** Status and assignee of a Conversation from any Source the member answers. Mail's folders are the same statuses. */
export default defineEventHandler(async (event) => {
  const { env } = cf(event)
  const member = await requireMember(event, await getServerId(env.DB))
  await updateCustomerConversation(env, member, getRouterParam(event, 'id')!, parseBody(schema, await readBody(event)))
  return { ok: true }
})
