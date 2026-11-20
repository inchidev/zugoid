import { mediaListQuery } from '../../../shared/media'
import { getServerId } from '../../../shared/server-id'
import { requireMember } from '../../utils/guards'
import { cf } from '../../utils/cf'
import { listMedia } from '../../utils/media'
import { parseBody } from '../../utils/validate'

/** A page of the Media timeline: your library, what others in the Space shared, or photos from conversations. */
export default defineEventHandler(async (event) => {
  const { env } = cf(event)
  const member = await requireMember(event, await getServerId(env.DB))
  const query = parseBody(mediaListQuery, getQuery(event))
  setHeader(event, 'Cache-Control', 'no-store')
  return listMedia(env, member, query.source, query.cursor)
})
