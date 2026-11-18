import { cf, fail } from '../../../utils/cf'
import { readPartnerTicket, removePartnerPerson, spendPartnerTicket } from '../../../utils/partner-signin'

/**
 * The partner's platform takes one of its people out of this Server: `Authorization: Bearer <remove ticket>`.
 * Only Servers a partner made answer; the ticket is signed with this Server's own key and works once.
 */
export default defineEventHandler(async (event) => {
  const { env, waitUntil } = cf(event)
  const token = getHeader(event, 'authorization')?.replace(/^Bearer\s+/iu, '') ?? ''
  const ticket = await readPartnerTicket(env, token, 'remove')
  if (!ticket || !await spendPartnerTicket(env, ticket)) fail(401, 'invalid_ticket', 'Invalid or expired ticket')
  const result = await removePartnerPerson(env, ticket.sub, waitUntil)
  if (result === 'owner') fail(409, 'owner', 'The Owner cannot be removed')
  return { ok: true, removed: result === 'removed' }
})
