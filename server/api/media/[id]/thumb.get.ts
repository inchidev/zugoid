import { getServerId } from '../../../../shared/server-id'
import { requireMember } from '../../../utils/guards'
import { cf, fail } from '../../../utils/cf'
import { requireMediaItem, serveMediaFile } from '../../../utils/media'

export default defineEventHandler(async (event) => {
  const { env } = cf(event)
  const member = await requireMember(event, await getServerId(env.DB))
  const row = await requireMediaItem(env, member, getRouterParam(event, 'id')!, 'read')
  if (!row.thumbR2Key) fail(404, 'not_found', 'No preview yet')
  return serveMediaFile(event, env, row.thumbR2Key, 'image/webp', 'preview.webp')
})
