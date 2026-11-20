import { mediaUploadSchema } from '../../../shared/media'
import { Permission } from '../../../shared/permissions'
import { getServerId } from '../../../shared/server-id'
import { requireMember } from '../../utils/guards'
import { cf } from '../../utils/cf'
import { rawBody, uploadMedia } from '../../utils/media'
import { parseBody } from '../../utils/validate'

/** One photo or video as the raw body, with what is known about it in the query. The same file twice is stored once. */
export default defineEventHandler(async (event) => {
  const { env } = cf(event)
  const member = await requireMember(event, await getServerId(env.DB), Permission.attachFiles)
  const input = parseBody(mediaUploadSchema, getQuery(event))
  return uploadMedia(env, member, input, await rawBody(event), Number(getHeader(event, 'content-length')))
})
