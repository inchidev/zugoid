import { z } from 'zod'
import { getServerId } from '../../../../../shared/server-id'
import type { CustomerWidgetConversationDTO } from '../../../../../shared/types'
import { requireMember } from '../../../../utils/guards'
import { cf } from '../../../../utils/cf'
import { listWidgetConversations } from '../../../../utils/customer-widgets'
import { parseBody } from '../../../../utils/validate'

const schema = z.object({
  status: z.enum(['open', 'waiting', 'resolved', 'spam', 'trash']).default('open'),
  before: z.string().max(40).optional(),
})

export default defineEventHandler(async (event): Promise<{ conversations: CustomerWidgetConversationDTO[] }> => {
  const { env } = cf(event)
  const member = await requireMember(event, await getServerId(env.DB))
  const query = parseBody(schema, getQuery(event))
  return { conversations: await listWidgetConversations(env, member, getRouterParam(event, 'id')!, query.status, query.before) }
})
