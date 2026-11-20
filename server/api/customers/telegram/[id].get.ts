import { getServerId } from '../../../../shared/server-id'
import { requireMember } from '../../../utils/guards'
import { cf } from '../../../utils/cf'
import { readTelegramBot } from '../../../utils/customer-telegram-bots'

export default defineEventHandler(async (event) => {
  const { env } = cf(event)
  const member = await requireMember(event, await getServerId(env.DB))
  return readTelegramBot(env, member, getRouterParam(event, 'id')!)
})
