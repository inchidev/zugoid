import { z } from 'zod'
import { getServerId } from '../../../shared/server-id'
import { creationSpaceId } from '../../../shared/spaces'
import { requireMember } from '../../utils/guards'
import { cf, fail } from '../../utils/cf'
import { connectTelegramBot } from '../../utils/customer-telegram-bots'
import { parseBody } from '../../utils/validate'

const schema = z.object({
  token: z.string().trim().min(1).max(120),
  updates: z.enum(['webhook', 'polling']).default('webhook'),
  apiBase: z.string().trim().max(300).nullish(),
  greeting: z.string().trim().max(2000).default(''),
})

/** Connects a bot by its BotFather token. */
export default defineEventHandler(async (event) => {
  const { env } = cf(event)
  const member = await requireMember(event, await getServerId(env.DB))
  const spaceId = creationSpaceId(member.authorization)
  if (!spaceId) fail(400, 'space_required', 'Choose a Space first')
  return connectTelegramBot(env, member, { ...parseBody(schema, await readBody(event)), spaceId })
})
