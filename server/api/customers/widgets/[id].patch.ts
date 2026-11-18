import { z } from 'zod'
import { getServerId } from '../../../../shared/server-id'
import { WIDGET_LIMITS } from '../../../../shared/customer-widgets'
import { requireMember } from '../../../utils/guards'
import { cf } from '../../../utils/cf'
import { updateCustomerWidget } from '../../../utils/customer-widgets'
import { parseBody } from '../../../utils/validate'

const schema = z.object({
  name: z.string().trim().min(1).max(WIDGET_LIMITS.name).optional(),
  sites: z.array(z.string().trim().min(1).max(300)).max(WIDGET_LIMITS.sites).optional(),
  greeting: z.string().trim().max(WIDGET_LIMITS.greeting).optional(),
  enabled: z.boolean().optional(),
})

export default defineEventHandler(async (event) => {
  const { env } = cf(event)
  const member = await requireMember(event, await getServerId(env.DB))
  await updateCustomerWidget(env, member, getRouterParam(event, 'id')!, parseBody(schema, await readBody(event)))
  return { ok: true }
})
