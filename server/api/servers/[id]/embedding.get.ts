import { cf, fail } from '../../../utils/cf'
import { requireMember } from '../../../utils/guards'
import { readServerEmbedding } from '../../../utils/server-theme'

/** Which sites may frame this Server: the Owner's to read and change, like sign-in. */
export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const member = await requireMember(event, getRouterParam(event, 'id')!)
  if (!member.isOwner) fail(403, 'forbidden', 'Only the owner can choose where this Server may be embedded')
  return { embedding: await readServerEmbedding(cf(event).env.DB) }
})
