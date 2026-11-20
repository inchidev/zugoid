import { getServerId } from '../../../../shared/server-id'
import { requireMember } from '../../../utils/guards'
import { cf } from '../../../utils/cf'
import { requireMediaItem, serveMediaFile } from '../../../utils/media'

export default defineEventHandler(async (event) => {
  const { env } = cf(event)
  const member = await requireMember(event, await getServerId(env.DB))
  const row = await requireMediaItem(env, member, getRouterParam(event, 'id')!, 'read')
  return serveMediaFile(event, env, row.r2Key, row.contentType, row.filename)
})
