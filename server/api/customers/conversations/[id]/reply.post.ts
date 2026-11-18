import { z } from 'zod'
import { getServerId } from '../../../../../shared/server-id'
import type { CustomerMessageDTO } from '../../../../../shared/types'
import { requireMember } from '../../../../utils/guards'
import { cf } from '../../../../utils/cf'
import { postCustomerConversationMessage } from '../../../../utils/customer-widgets'
import { parseBody } from '../../../../utils/validate'

const schema = z.object({ content: z.string().trim().min(1).max(20_000) })

/** A reply that reaches the Visitor. */
export default defineEventHandler(async (event): Promise<{ message: CustomerMessageDTO }> => {
  const { env } = cf(event)
  const member = await requireMember(event, await getServerId(env.DB))
  const { content } = parseBody(schema, await readBody(event))
  return { message: await postCustomerConversationMessage(env, member, getRouterParam(event, 'id')!, { content, kind: 'reply' }) }
})
