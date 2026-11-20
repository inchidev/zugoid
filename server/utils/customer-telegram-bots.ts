import type { CustomerTelegramBotDTO } from '../../shared/types'
import { encryptSecret } from '../../shared/encrypted-secret'
import { newId, nowIso } from '../../shared/ids'
import { spaceSql } from '../../shared/spaces'
import type { ZugoidEnv } from '../../workers/env'
import { asRpc } from '../../workers/env'
import {
  loadTelegramBot, routeTelegramUpdates, TELEGRAM_API, TELEGRAM_TOKEN, telegramCall, TelegramError, telegramToken, telegramTokenScope,
} from '../../workers/customer-telegram'
import type { ServerMembership } from './channel-access'
import { fail } from './cf'
import { canManageWidgets as canManageSources, randomToken, spaceMemberIds, visitorAuthorStatement } from './customer-widgets'
import { auditStatement } from './messages'
import { primaryServerOrigin } from './server-origins'

/**
 * Telegram bots as the team sees them. A bot is a private channel in Customers and a Source;
 * its channel members answer it. The Owner or someone with Manage server connects it with
 * the token BotFather gave, which the Server checks with Telegram and keeps encrypted.
 */

type BotRow = {
  channelId: string; spaceId: string; botId: string; username: string; updates: 'webhook' | 'polling'; apiBase: string; greeting: string
  enabled: number; lastError: string | null; openCount: number; member: number
}

const botColumns = `b.channel_id AS channelId, sc.space_id AS spaceId, b.bot_id AS botId, b.username, b.updates, b.api_base AS apiBase,
  b.greeting, b.enabled, b.last_error AS lastError,
  (SELECT count(*) FROM customer_conversations cv WHERE cv.source_channel_id = b.channel_id AND cv.status IN ('open', 'waiting')) AS openCount,
  EXISTS (SELECT 1 FROM channel_members cm WHERE cm.channel_id = b.channel_id AND cm.user_id = ?1) AS member`

function botDto(row: BotRow, member: ServerMembership): CustomerTelegramBotDTO {
  const answers = Boolean(row.member)
  const manages = canManageSources(member)
  return {
    channelId: row.channelId, spaceId: row.spaceId, botId: row.botId, username: row.username, updates: row.updates,
    apiBase: row.apiBase, greeting: row.greeting, enabled: Boolean(row.enabled), lastError: manages ? row.lastError : null,
    openCount: answers ? Number(row.openCount) : 0, member: answers, canManage: manages,
  }
}

export async function listTelegramBots(env: ZugoidEnv, member: ServerMembership): Promise<CustomerTelegramBotDTO[]> {
  const rows = await env.DB.prepare(
    `SELECT ${botColumns} FROM customer_telegram_bots b JOIN channels sc ON sc.id = b.channel_id
     WHERE sc.space_id IN (${spaceSql(member.authorization)}) ORDER BY lower(b.username), b.channel_id`,
  ).bind(member.user.id).all<BotRow>()
  return (rows.results ?? []).filter(row => row.member || canManageSources(member)).map(row => botDto(row, member))
}

async function findBot(env: ZugoidEnv, member: ServerMembership, channelId: string, manage = false): Promise<BotRow> {
  const row = await env.DB.prepare(
    `SELECT ${botColumns} FROM customer_telegram_bots b JOIN channels sc ON sc.id = b.channel_id
     WHERE b.channel_id = ?2 AND sc.space_id IN (${spaceSql(member.authorization)})`,
  ).bind(member.user.id, channelId).first<BotRow>()
  if (!row || (!row.member && !canManageSources(member))) fail(404, 'not_found', 'Telegram bot not found')
  if (manage && !canManageSources(member)) fail(403, 'forbidden', 'Managing a Telegram bot takes Manage server')
  return row
}

export async function readTelegramBot(env: ZugoidEnv, member: ServerMembership, channelId: string): Promise<{ bot: CustomerTelegramBotDTO; memberIds: string[] }> {
  const row = await findBot(env, member, channelId)
  const members = await env.DB.prepare(
    "SELECT cm.user_id AS id FROM channel_members cm JOIN users u ON u.id = cm.user_id WHERE cm.channel_id = ? AND u.status = 'active' ORDER BY cm.joined_at",
  ).bind(channelId).all<{ id: string }>()
  return { bot: botDto(row, member), memberIds: (members.results ?? []).map(item => item.id) }
}

/** An `https` Bot API address without a path, query or credentials; Telegram's own when empty. */
export function telegramApiBase(value: string | null | undefined): string {
  const text = value?.trim()
  if (!text) return TELEGRAM_API
  let url: URL
  try { url = new URL(text) }
  catch { fail(400, 'bad_request', 'The Bot API address must look like https://api.telegram.org') }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) fail(400, 'bad_request', 'The Bot API address must be https:// with no login, query or #')
  return `${url.origin}${url.pathname.replace(/\/+$/u, '')}`
}

/** Telegram's word on a token: the bot it belongs to. */
async function botOfToken(apiBase: string, token: string): Promise<{ id: string; username: string }> {
  const match = TELEGRAM_TOKEN.exec(token.trim())
  if (!match) fail(400, 'bad_request', 'That is not a bot token. BotFather gives one like 123456789:AA…')
  try {
    const me = await telegramCall<{ id: number; is_bot: boolean; username?: string }>(apiBase, token.trim(), 'getMe')
    if (!me.is_bot || String(me.id) !== match[1] || !me.username) fail(400, 'bad_request', 'Telegram did not confirm this bot')
    return { id: String(me.id), username: me.username }
  }
  catch (error) {
    if (error instanceof TelegramError) fail(400, 'telegram', `Telegram refused the token: ${error.message}`)
    throw error
  }
}

/** Points Telegram at the Server, or starts the Server asking; Telegram's refusal is the caller's error. */
async function routeUpdates(env: ZugoidEnv, bot: { channelId: string; apiBase: string; webhookSecret: string; updates: 'webhook' | 'polling' }, token: string) {
  try {
    await routeTelegramUpdates(env, bot, token, await primaryServerOrigin(env))
  }
  catch (error) {
    if (!(error instanceof TelegramError)) throw error
    fail(400, 'telegram', bot.updates === 'webhook'
      ? `Telegram cannot call this Server: ${error.message}. A Server without a public https address takes updates by asking Telegram.`
      : `Telegram refused: ${error.message}`)
  }
  if (bot.updates === 'polling') {
    await asRpc<{ startTelegramPolling: () => Promise<void> }>(env.CHANNEL_DO.getByName(`channel:${bot.channelId}`)).startTelegramPolling()
  }
}

export async function connectTelegramBot(env: ZugoidEnv, member: ServerMembership, input: { spaceId: string; token: string; updates: 'webhook' | 'polling'; apiBase?: string | null; greeting?: string }) {
  if (!canManageSources(member)) fail(403, 'forbidden', 'Connecting a Telegram bot takes Manage server')
  if (!env.AUTH_SECRET) fail(503, 'unavailable', 'The Server has no AUTH_SECRET to keep the token with')
  const apiBase = telegramApiBase(input.apiBase)
  const token = input.token.trim()
  const me = await botOfToken(apiBase, token)
  if (await env.DB.prepare('SELECT 1 AS ok FROM customer_telegram_bots WHERE bot_id = ?').bind(me.id).first()) fail(409, 'conflict', `@${me.username} is already connected`)
  const channelId = newId()
  const at = nowIso()
  const secret = await encryptSecret(env.AUTH_SECRET, telegramTokenScope(channelId), token)
  const webhookSecret = randomToken(32)
  const answering = await spaceMemberIds(env, input.spaceId, [...new Set([member.user.id, member.ownerId])])
  await env.DB.batch([
    visitorAuthorStatement(env, at),
    env.DB.prepare(
      `INSERT INTO channels (id, space_id, name, topic, type, section, visibility, category_id, position, created_by, live_meeting_id, parent_id, parent_message_id, created_at, updated_at)
       VALUES (?, ?, ?, '', 'text', 'customers', 'private', NULL, 0, ?, NULL, NULL, NULL, ?, ?)`,
    ).bind(channelId, input.spaceId, `@${me.username}`, member.user.id, at, at),
    env.DB.prepare(
      `INSERT INTO customer_telegram_bots (channel_id, bot_id, username, token_ciphertext, token_iv, webhook_secret, updates, api_base, update_offset, greeting, enabled, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 1, ?, ?, ?)`,
    ).bind(channelId, me.id, me.username, secret.ciphertext, secret.iv, webhookSecret, input.updates, apiBase, input.greeting ?? '', member.user.id, at, at),
    ...[...answering].map(userId => env.DB.prepare('INSERT INTO channel_members (channel_id, user_id, hidden_at, joined_at) VALUES (?, ?, NULL, ?)').bind(channelId, userId, at)),
    await auditStatement(env, { serverId: member.serverId, actorId: member.user.id, action: 'customer_telegram_bot.create', targetType: 'customer_telegram_bot',
      targetId: channelId, meta: { username: me.username, updates: input.updates, apiBase }, authorization: member.authorization }),
  ])
  try {
    await routeUpdates(env, { channelId, apiBase, webhookSecret, updates: input.updates }, token)
  }
  catch (error) {
    // Nothing half-connected stays behind.
    await env.DB.prepare('DELETE FROM channels WHERE id = ?').bind(channelId).run()
    throw error
  }
  return { channelId }
}

export async function updateTelegramBot(env: ZugoidEnv, member: ServerMembership, channelId: string, input: { token?: string; updates?: 'webhook' | 'polling'; apiBase?: string | null; greeting?: string; enabled?: boolean }) {
  await findBot(env, member, channelId, true)
  const stored = (await loadTelegramBot(env, channelId))!
  const apiBase = input.apiBase === undefined ? stored.apiBase : telegramApiBase(input.apiBase)
  const updates = input.updates ?? stored.updates
  let token = await telegramToken(env, stored)
  let secret: { ciphertext: string; iv: string } | null = null
  if (input.token?.trim()) {
    const me = await botOfToken(apiBase, input.token)
    if (me.id !== stored.botId) fail(400, 'bad_request', `That token is for @${me.username}, not @${stored.username}. Connect it as another bot.`)
    token = input.token.trim()
    secret = await encryptSecret(env.AUTH_SECRET!, telegramTokenScope(channelId), token)
  }
  else if (apiBase !== stored.apiBase) {
    await botOfToken(apiBase, token)
  }
  const at = nowIso()
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE customer_telegram_bots SET token_ciphertext = coalesce(?, token_ciphertext), token_iv = coalesce(?, token_iv), updates = ?, api_base = ?,
         greeting = coalesce(?, greeting), enabled = coalesce(?, enabled), last_error = NULL, updated_at = ? WHERE channel_id = ?`,
    ).bind(secret?.ciphertext ?? null, secret?.iv ?? null, updates, apiBase, input.greeting ?? null,
      input.enabled === undefined ? null : input.enabled ? 1 : 0, at, channelId),
    await auditStatement(env, { serverId: member.serverId, actorId: member.user.id, action: 'customer_telegram_bot.update', targetType: 'customer_telegram_bot',
      targetId: channelId, meta: { updates, apiBase, greeting: input.greeting, enabled: input.enabled, token: secret ? 'replaced' : undefined }, authorization: member.authorization }),
  ])
  if (updates !== stored.updates || apiBase !== stored.apiBase || secret || input.enabled) {
    await routeUpdates(env, { channelId, apiBase, webhookSecret: stored.webhookSecret, updates }, token)
  }
}

/** Removes the bot, its Conversations and its webhook. Its Contacts stay. */
export async function deleteTelegramBot(env: ZugoidEnv, member: ServerMembership, channelId: string) {
  await findBot(env, member, channelId, true)
  const stored = await loadTelegramBot(env, channelId)
  if (stored) {
    // The token may already be revoked: the bot goes either way.
    await telegramToken(env, stored).then(token => telegramCall(stored.apiBase, token, 'deleteWebhook', {})).catch(() => undefined)
  }
  await env.DB.batch([
    await auditStatement(env, { serverId: member.serverId, actorId: member.user.id, action: 'customer_telegram_bot.delete', targetType: 'customer_telegram_bot',
      targetId: channelId, authorization: member.authorization }),
    env.DB.prepare('DELETE FROM channels WHERE id = ?').bind(channelId),
  ])
}

/** Who answers the bot: Members of its Space. The Owner always does. */
export async function setTelegramBotMembers(env: ZugoidEnv, member: ServerMembership, channelId: string, userIds: string[]) {
  const row = await findBot(env, member, channelId, true)
  const ids = [...await spaceMemberIds(env, row.spaceId, [...new Set([...userIds, member.ownerId])])]
  const at = nowIso()
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM channel_members WHERE channel_id = ? AND user_id NOT IN (${ids.map(() => '?').join(',') || "''"})`).bind(channelId, ...ids),
    ...ids.map(userId => env.DB.prepare('INSERT OR IGNORE INTO channel_members (channel_id, user_id, hidden_at, joined_at) VALUES (?, ?, NULL, ?)').bind(channelId, userId, at)),
    await auditStatement(env, { serverId: member.serverId, actorId: member.user.id, action: 'customer_telegram_bot.members', targetType: 'customer_telegram_bot',
      targetId: channelId, meta: { members: ids }, authorization: member.authorization }),
  ])
}
