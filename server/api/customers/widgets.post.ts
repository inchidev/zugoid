import { z } from 'zod'
import { getServerId } from '../../../shared/server-id'
import { creationSpaceId } from '../../../shared/spaces'
import { WIDGET_LIMITS } from '../../../shared/customer-widgets'
import { requireMember } from '../../utils/guards'
import { cf, fail } from '../../utils/cf'
import { createCustomerWidget } from '../../utils/customer-widgets'
import { parseBody } from '../../utils/validate'

const schema = z.object({
  name: z.string().trim().min(1).max(WIDGET_LIMITS.name),
  sites: z.array(z.string().trim().min(1).max(300)).max(WIDGET_LIMITS.sites).default([]),
  greeting: z.string().trim().max(WIDGET_LIMITS.greeting).default(''),
})

export default defineEventHandler(async (event) => {
  const { env } = cf(event)
  const member = await requireMember(event, await getServerId(env.DB))
  const spaceId = creationSpaceId(member.authorization)
  if (!spaceId) fail(400, 'space_required', 'Choose a Space first')
  return createCustomerWidget(env, member, { ...parseBody(schema, await readBody(event)), spaceId })
})
