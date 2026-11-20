import { getServerId } from '../../../../shared/server-id'
import { requireMember } from '../../../utils/guards'
import { cf, fail } from '../../../utils/cf'
import { MEDIA_THUMB_BYTES } from '../../../../shared/media'
import { setMediaThumb } from '../../../utils/media'

/** The preview the browser made for an item, as the raw body. */
export default defineEventHandler(async (event) => {
  const { env } = cf(event)
  const member = await requireMember(event, await getServerId(env.DB))
  const bytes = await readRawBody(event, false)
  if (!bytes?.byteLength || bytes.byteLength > MEDIA_THUMB_BYTES) fail(400, 'bad_request', 'A preview is up to 512 KB')
  return setMediaThumb(env, member, getRouterParam(event, 'id')!, new Uint8Array(bytes))
})
