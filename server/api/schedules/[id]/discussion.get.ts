import { requireChannelAccess } from '../../../utils/guards'
import { findSchedule } from '../../../utils/schedule-service'
import { cf, fail } from '../../../utils/cf'
import { Permission, hasPermission } from '../../../../shared/permissions'

export default defineEventHandler(async event => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const { env } = cf(event)
  const item = await findSchedule(env, getRouterParam(event, 'id')!)
  if (!item?.discussionChannelId) fail(404, 'not_found', 'Schedule chat not found')
  const access = await requireChannelAccess(event, item.discussionChannelId)
  return {
    channelId: item.discussionChannelId,
    canSend: !access.frozen && hasPermission(access.perms, Permission.sendMessages),
  }
})
