import { z } from 'zod'
import { getServerId } from '../../../../shared/server-id'
import { requireMember } from '../../../utils/guards'
import { cf } from '../../../utils/cf'
import { updateTelegramBot } from '../../../utils/customer-telegram-bots'
import { parseBody } from '../../../utils/validate'

const schema = z.object({
  token: z.string().trim().max(120).optional(),
  updates: z.enum(['webhook', 'polling']).optional(),
  apiBase: z.string().trim().max(300).nullish(),
  greeting: z.string().trim().max(2000).optional(),
  enabled: z.boolean().optional(),
})

export default defineEventHandler(async (event) => {
  const { env } = cf(event)
  const member = await requireMember(event, await getServerId(env.DB))
  await updateTelegramBot(env, member, getRouterParam(event, 'id')!, parseBody(schema, await readBody(event)))
  return { ok: true }
})
