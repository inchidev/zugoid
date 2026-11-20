import { getServerId } from '../../../../../shared/server-id'
import { requireMember } from '../../../../utils/guards'
import { cf } from '../../../../utils/cf'
import { rawBody, uploadPart } from '../../../../utils/media'

export default defineEventHandler(async (event) => {
  const { env } = cf(event)
  const member = await requireMember(event, await getServerId(env.DB))
  return uploadPart(env, member, getRouterParam(event, 'upload')!, Number(getRouterParam(event, 'part')), await rawBody(event), Number(getHeader(event, 'content-length')))
})
