import { cf, fail } from '../../utils/cf'
import { secureTokenEqual } from '../../../workers/mail-gateway-ingress'
import { loadTelegramBot, takeTelegramUpdate, type TelegramUpdate } from '../../../workers/customer-telegram'

/**
 * Telegram's webhook for one bot. Telegram proves itself with the bot's random secret in
 * `X-Telegram-Bot-Api-Secret-Token`; no session or cookie is read. An update is answered
 * after it is stored, so a failure makes Telegram send it again.
 */
export default defineEventHandler(async (event) => {
  const { env } = cf(event)
  const bot = await loadTelegramBot(env, getRouterParam(event, 'id') ?? '')
  const secret = getHeader(event, 'x-telegram-bot-api-secret-token') ?? ''
  if (!bot || bot.updates !== 'webhook' || !secret || !await secureTokenEqual(secret, bot.webhookSecret)) fail(404, 'not_found', 'Not found')
  const update = await readBody<TelegramUpdate>(event).catch(() => null)
  if (!update || typeof update.update_id !== 'number') fail(400, 'bad_request', 'Not a Telegram update')
  await takeTelegramUpdate(env, bot, update)
  return { ok: true }
})
