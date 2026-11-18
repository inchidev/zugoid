import { z } from 'zod'
import { getServerId } from '../../../shared/server-id'
import { creationSpaceId } from '../../../shared/spaces'
import { requireMember } from '../../utils/guards'
import { cf, fail } from '../../utils/cf'
import { createCustomerCompany } from '../../utils/customers'
import { parseBody } from '../../utils/validate'

const schema = z.object({
  name: z.string().trim().min(1).max(200),
  domains: z.array(z.string().trim().min(1).max(253)).max(20).default([]),
})

export default defineEventHandler(async (event) => {
  const { env } = cf(event)
  const member = await requireMember(event, await getServerId(env.DB))
  const spaceId = creationSpaceId(member.authorization)
  if (!spaceId) fail(400, 'space_required', 'Choose a Space first')
  return createCustomerCompany(env, member, { ...parseBody(schema, await readBody(event)), spaceId })
})
