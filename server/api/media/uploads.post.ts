import { mediaUploadSchema } from '../../../shared/media'
import { Permission } from '../../../shared/permissions'
import { getServerId } from '../../../shared/server-id'
import { requireMember } from '../../utils/guards'
import { cf } from '../../utils/cf'
import { startMultipart } from '../../utils/media'
import { parseBody } from '../../utils/validate'

/** Starts a file over 95 MB, sent in parts. */
export default defineEventHandler(async (event) => {
  const { env } = cf(event)
  const member = await requireMember(event, await getServerId(env.DB), Permission.attachFiles)
  return startMultipart(env, member, parseBody(mediaUploadSchema, await readBody(event)))
})
