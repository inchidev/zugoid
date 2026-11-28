import { getServerId } from '../../../../../../shared/server-id'
import { cf } from '../../../../../utils/cf'
import { previewAppBuild } from '../../../../../utils/factory-builds'
import { requireMember } from '../../../../../utils/guards'

export default defineEventHandler(async event => {
  const { env } = cf(event)
  const actor = await requireMember(event, await getServerId(env.DB))
  return previewAppBuild(env, actor, getRouterParam(event, 'id')!, getRouterParam(event, 'build')!)
})
