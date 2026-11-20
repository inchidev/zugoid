import { getServerId } from '../../../../shared/server-id'
import { requireMember } from '../../../utils/guards'
import { cf } from '../../../utils/cf'
import { abortMultipart } from '../../../utils/media'

export default defineEventHandler(async (event) => {
  const { env } = cf(event)
  const member = await requireMember(event, await getServerId(env.DB))
  await abortMultipart(env, member, getRouterParam(event, 'upload')!)
  return { ok: true }
})
