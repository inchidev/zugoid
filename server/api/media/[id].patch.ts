import { mediaPatchSchema } from '../../../shared/media'
import { getServerId } from '../../../shared/server-id'
import { requireMember } from '../../utils/guards'
import { cf } from '../../utils/cf'
import { setMediaVisibility } from '../../utils/media'
import { parseBody } from '../../utils/validate'

/** Shares an item with its Space, or makes it yours alone again. */
export default defineEventHandler(async (event) => {
  const { env } = cf(event)
  const member = await requireMember(event, await getServerId(env.DB))
  return setMediaVisibility(env, member, getRouterParam(event, 'id')!, parseBody(mediaPatchSchema, await readBody(event)).visibility)
})
