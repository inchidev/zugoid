import { z } from 'zod'
import { getServerId } from '../../../../../shared/server-id'
import { requireMember } from '../../../../utils/guards'
import { cf } from '../../../../utils/cf'
import { setTelegramBotMembers } from '../../../../utils/customer-telegram-bots'
import { parseBody } from '../../../../utils/validate'

const schema = z.object({ userIds: z.array(z.string().trim().min(1).max(80)).max(500) })

/** Who answers the bot. */
export default defineEventHandler(async (event) => {
  const { env } = cf(event)
  const member = await requireMember(event, await getServerId(env.DB))
  await setTelegramBotMembers(env, member, getRouterParam(event, 'id')!, parseBody(schema, await readBody(event)).userIds)
  return { ok: true }
})
