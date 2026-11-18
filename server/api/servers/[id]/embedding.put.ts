import { cf, fail } from '../../../utils/cf'
import { requireMember } from '../../../utils/guards'
import { saveServerEmbedding } from '../../../utils/server-theme'

export default defineEventHandler(async (event) => {
  const member = await requireMember(event, getRouterParam(event, 'id')!)
  if (!member.isOwner) fail(403, 'forbidden', 'Only the owner can choose where this Server may be embedded')
  return { embedding: await saveServerEmbedding(cf(event).env, member.authorization, await readBody(event)) }
})
