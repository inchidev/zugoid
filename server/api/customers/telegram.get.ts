import { getServerId } from '../../../shared/server-id'
import type { CustomerTelegramBotDTO } from '../../../shared/types'
import { requireMember } from '../../utils/guards'
import { cf } from '../../utils/cf'
import { listTelegramBots } from '../../utils/customer-telegram-bots'
import { canManageWidgets } from '../../utils/customer-widgets'

export default defineEventHandler(async (event): Promise<{ bots: CustomerTelegramBotDTO[]; canManage: boolean }> => {
  const { env } = cf(event)
  const member = await requireMember(event, await getServerId(env.DB))
  return { bots: await listTelegramBots(env, member), canManage: canManageWidgets(member) }
})
