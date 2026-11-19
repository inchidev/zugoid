import { CUSTOMER_VISITOR_USER_ID } from '../shared/customer-widgets'
import { decryptSecret } from '../shared/encrypted-secret'
import { fileStorage } from '../shared/file-storage'
import { newId, nowIso } from '../shared/ids'
import { MAX_ATTACHMENT_BYTES } from '../shared/mime'
import { getServerId } from '../shared/server-id'
import type { CustomerDeliveryDTO, MessageDTO } from '../shared/types'
import type { ZugoidEnv } from './env'
import { fanoutStoredMessage, type ConversationFacts } from './customer-delivery'
import { identityContactTouchStatement, insertConversationStatement, touchConversationStatement } from './customer-records'

/**
 * A Telegram bot as a Customers Source. People write to the bot in private chats; each
 * Telegram user is a verified `telegram` Identity, since Telegram itself names the sender.
 * Updates arrive at the Server's webhook, or, for a Server Telegram cannot reach, the bot's
 * channel Durable Object asks for them. Replies go back through the Bot API at `api_base`,
 * which a Server that cannot reach api.telegram.org points at its own Bot API server or proxy.
 */

export const TELEGRAM_API = 'https://api.telegram.org'
export const TELEGRAM_TOKEN = /^(\d{5,15}):[A-Za-z0-9_-]{30,64}$/u
/** Telegram waits this long for a webhook answer; a long poll asks for this long. */
const POLL_SECONDS = 25

export const telegramTokenScope = (channelId: string) => `customer-telegram:${channelId}`

export type TelegramBot = {
  channelId: string
  spaceId: string
  botId: string
  username: string
  tokenCiphertext: string
  tokenIv: string
  webhookSecret: string
  updates: 'webhook' | 'polling'
  apiBase: string
  updateOffset: number
  greeting: string
  enabled: number
}

export async function loadTelegramBot(env: ZugoidEnv, channelId: string): Promise<TelegramBot | null> {
  return await env.DB.prepare(
    `SELECT b.channel_id AS channelId, c.space_id AS spaceId, b.bot_id AS botId, b.username, b.token_ciphertext AS tokenCiphertext,
       b.token_iv AS tokenIv, b.webhook_secret AS webhookSecret, b.updates, b.api_base AS apiBase, b.update_offset AS updateOffset,
       b.greeting, b.enabled
     FROM customer_telegram_bots b JOIN channels c ON c.id = b.channel_id WHERE b.channel_id = ?`,
  ).bind(channelId).first<TelegramBot>()
}

export async function telegramToken(env: ZugoidEnv, bot: Pick<TelegramBot, 'channelId' | 'tokenCiphertext' | 'tokenIv'>): Promise<string> {
  if (!env.AUTH_SECRET) throw new Error('The Server has no AUTH_SECRET')
  return await decryptSecret(env.AUTH_SECRET, telegramTokenScope(bot.channelId), { ciphertext: bot.tokenCiphertext, iv: bot.tokenIv, version: 1 })
}

export class TelegramError extends Error {
  constructor(message: string, readonly code?: number, readonly retryAfter?: number) {
    super(message)
  }
}

/** One Bot API call. The token is in the address, so neither the address nor the request is ever logged. */
export async function telegramCall<T>(apiBase: string, token: string, method: string, body: Record<string, unknown> | FormData = {}, timeoutMs = 30_000): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${apiBase.replace(/\/+$/u, '')}/bot${token}/${method}`, {
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
      headers: body instanceof FormData ? undefined : { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    })
  }
  catch {
    throw new TelegramError(`The Server could not reach ${new URL(apiBase).host}`)
  }
  const json = await response.json().catch(() => null) as { ok?: boolean; result?: T; description?: string; error_code?: number; parameters?: { retry_after?: number } } | null
  if (!json?.ok) throw new TelegramError(json?.description ?? `Telegram answered ${response.status}`, json?.error_code ?? response.status, json?.parameters?.retry_after)
  return json.result as T
}

type TelegramUser = { id: number; is_bot: boolean; first_name: string; last_name?: string; username?: string }
type TelegramFile = { file_id: string; file_size?: number; mime_type?: string; file_name?: string }
type TelegramMessage = {
  message_id: number
  from?: TelegramUser
  chat: { id: number; type: string }
  text?: string
  caption?: string
  photo?: Array<TelegramFile & { width: number; height: number }>
  voice?: TelegramFile
  audio?: TelegramFile
  video?: TelegramFile & { width: number; height: number }
  video_note?: TelegramFile & { length: number }
  document?: TelegramFile
  sticker?: { emoji?: string }
}
export type TelegramUpdate = { update_id: number; message?: TelegramMessage }

type Media = { file: TelegramFile; filename: string; contentType: string; width: number | null; height: number | null }

/** Pictures, voice, video and round video messages come in; anything else is named in the text. */
function mediaOf(message: TelegramMessage): { media: Media | null; unsupported: string | null } {
  const largest = message.photo?.reduce((best, size) => size.width * size.height > best.width * best.height ? size : best)
  if (largest) return { media: { file: largest, filename: 'photo.jpg', contentType: 'image/jpeg', width: largest.width, height: largest.height }, unsupported: null }
  if (message.voice) return { media: { file: message.voice, filename: 'voice.ogg', contentType: message.voice.mime_type || 'audio/ogg', width: null, height: null }, unsupported: null }
  if (message.audio) return { media: { file: message.audio, filename: message.audio.file_name || 'audio.mp3', contentType: message.audio.mime_type || 'audio/mpeg', width: null, height: null }, unsupported: null }
  if (message.video_note) return { media: { file: message.video_note, filename: 'video-note.mp4', contentType: 'video/mp4', width: message.video_note.length, height: message.video_note.length }, unsupported: null }
  if (message.video) return { media: { file: message.video, filename: 'video.mp4', contentType: message.video.mime_type || 'video/mp4', width: message.video.width, height: message.video.height }, unsupported: null }
  if (message.sticker) return { media: null, unsupported: message.sticker.emoji ? `Sticker ${message.sticker.emoji}` : 'A sticker' }
  if (message.document) return { media: null, unsupported: `A file (${message.document.file_name ?? 'unnamed'}), which Customers does not take yet` }
  return { media: null, unsupported: message.text || message.caption ? null : 'A kind of message Customers does not show yet' }
}

async function downloadMedia(env: ZugoidEnv, bot: TelegramBot, token: string, media: Media, conversationId: string, attachmentId: string) {
  if ((media.file.file_size ?? 0) > MAX_ATTACHMENT_BYTES) return null
  const { file_path: path } = await telegramCall<{ file_path?: string }>(bot.apiBase, token, 'getFile', { file_id: media.file.file_id })
  if (!path) return null
  const response = await fetch(`${bot.apiBase.replace(/\/+$/u, '')}/file/bot${token}/${path}`, { signal: AbortSignal.timeout(60_000) })
  if (!response.ok) return null
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (!bytes.byteLength || bytes.byteLength > MAX_ATTACHMENT_BYTES) return null
  const key = `${await getServerId(env.DB)}/${conversationId}/${attachmentId}-${media.filename}`
  await fileStorage(env).put(key, bytes, { httpMetadata: { contentType: media.contentType } })
  return { key, size: bytes.byteLength }
}

/** Telegram's name for someone, as the team will see it. */
function personName(user: TelegramUser): string {
  return [user.first_name, user.last_name].filter(Boolean).join(' ').replace(/\p{Cc}+/gu, ' ').trim().slice(0, 120) || `Telegram ${user.id}`
}

/**
 * One update from Telegram, taken once: an update below the bot's offset was already
 * taken. A message in a private chat goes into the sender's latest open, waiting or Spam
 * Conversation with this bot, or starts one; /start only gets the greeting.
 */
export async function takeTelegramUpdate(env: ZugoidEnv, bot: TelegramBot, update: TelegramUpdate): Promise<void> {
  if (update.update_id < bot.updateOffset) return
  const message = update.message
  const sender = message?.from
  if (message && sender && !sender.is_bot && message.chat.type === 'private' && bot.enabled) {
    const token = await telegramToken(env, bot)
    if (message.text?.trim() === '/start') {
      if (bot.greeting) await telegramCall(bot.apiBase, token, 'sendMessage', { chat_id: message.chat.id, text: bot.greeting })
    }
    else {
      await storeInbound(env, bot, token, message, sender)
    }
  }
  bot.updateOffset = update.update_id + 1
  await env.DB.prepare('UPDATE customer_telegram_bots SET update_offset = max(update_offset, ?), last_error = NULL, updated_at = ? WHERE channel_id = ?')
    .bind(bot.updateOffset, nowIso(), bot.channelId).run()
}

async function storeInbound(env: ZugoidEnv, bot: TelegramBot, token: string, message: TelegramMessage, sender: TelegramUser) {
  const at = nowIso()
  const name = personName(sender)
  const value = String(sender.id)
  let identity = await env.DB.prepare(`SELECT id FROM customer_identities WHERE space_id = ? AND kind = 'telegram' AND value = ?`)
    .bind(bot.spaceId, value).first<{ id: string }>()
  const statements: D1PreparedStatement[] = []
  if (!identity) {
    identity = { id: newId() }
    const contactId = newId()
    statements.push(
      env.DB.prepare(`INSERT INTO customer_contacts (id, space_id, name, first_seen_at, last_seen_at, last_contacted_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, NULL, NULL, ?, ?)`).bind(contactId, bot.spaceId, name, at, at, at),
      env.DB.prepare(`INSERT INTO customer_identities (id, space_id, kind, value, display_name, contact_id, verified_at, verified_by, created_at, updated_at)
        VALUES (?, ?, 'telegram', ?, ?, ?, ?, 'telegram', ?, ?)`).bind(identity.id, bot.spaceId, value, name, contactId, at, at, at),
    )
  }
  else {
    statements.push(env.DB.prepare('UPDATE customer_identities SET display_name = ?, updated_at = ? WHERE id = ?')
      .bind(name, at, identity.id))
  }
  const existing = await env.DB.prepare(
    `SELECT channel_id AS channelId FROM customer_conversations
     WHERE source_channel_id = ? AND identity_id = ? AND status IN ('open', 'waiting', 'spam')
     ORDER BY last_message_at DESC, channel_id DESC LIMIT 1`,
  ).bind(bot.channelId, identity.id).first<{ channelId: string }>()
  const conversationId = existing?.channelId ?? newId()
  const { media, unsupported } = mediaOf(message)
  const content = [message.text ?? message.caption ?? '', unsupported ? `[${unsupported}]` : ''].filter(Boolean).join('\n').slice(0, 20_000)
  const messageId = newId()
  const attachmentId = newId()
  const stored = media ? await downloadMedia(env, bot, token, media, conversationId, attachmentId).catch(() => null) : null
  const text = content || (media && !stored ? '[A file too large to bring over from Telegram]' : '')
  statements.push(
    ...existing
      ? [touchConversationStatement(env, { channelId: conversationId, at, inbound: true })]
      : [
          env.DB.prepare(
            `INSERT INTO channels (id, name, topic, type, section, visibility, category_id, position, live_meeting_id, parent_id, parent_message_id, created_at, updated_at)
             VALUES (?, ?, '', 'conversation', 'customers', 'private', NULL, 0, NULL, ?, NULL, ?, ?)`,
          ).bind(conversationId, (text || name).replace(/\s+/gu, ' ').slice(0, 80), bot.channelId, at, at),
          insertConversationStatement(env, { channelId: conversationId, sourceChannelId: bot.channelId, identityId: identity.id, at }),
        ],
    env.DB.prepare(`INSERT INTO messages (id, channel_id, author_id, content, reply_to_id, edited_at, deleted_at, created_at)
      VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?)`).bind(messageId, conversationId, CUSTOMER_VISITOR_USER_ID, text, at),
    ...stored && media
      ? [env.DB.prepare(`INSERT INTO attachments (id, message_id, channel_id, uploader_id, r2_key, filename, content_type, size_bytes, width, height, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(attachmentId, messageId, conversationId, CUSTOMER_VISITOR_USER_ID, stored.key, media.filename,
          media.contentType, stored.size, media.width, media.height, at)]
      : [],
    env.DB.prepare(`INSERT INTO customer_telegram_messages (message_id, conversation_channel_id, direction, status, telegram_message_id, created_at)
      VALUES (?, ?, 'inbound', 'received', ?, ?)`).bind(messageId, conversationId, message.message_id, at),
    identityContactTouchStatement(env, { identityId: identity.id, at, inbound: true }),
  )
  await env.DB.batch(statements)
  await fanoutStoredMessage(env, messageId)
}

/** How a file goes to Telegram: a picture, a voice message Telegram can play as one, or a file. */
function sendMethod(contentType: string): { method: string; field: string } {
  if (contentType.startsWith('image/') && contentType !== 'image/gif') return { method: 'sendPhoto', field: 'photo' }
  if (contentType === 'image/gif') return { method: 'sendAnimation', field: 'animation' }
  if (['audio/ogg', 'audio/mpeg', 'audio/mp4'].includes(contentType)) return { method: 'sendVoice', field: 'voice' }
  if (contentType.startsWith('video/')) return { method: 'sendVideo', field: 'video' }
  return { method: 'sendDocument', field: 'document' }
}

/**
 * A team reply to Telegram, after it is stored as `pending`. Text goes as a message, each file
 * as its own message with the text as the first one's caption when it fits. The delivery row
 * becomes `sent` or `failed` with Telegram's reason.
 */
export async function sendTelegramReply(env: ZugoidEnv, facts: ConversationFacts, message: MessageDTO): Promise<CustomerDeliveryDTO> {
  let telegramMessageId: number | null = null
  let error: string | null = null
  try {
    const [bot, chat] = await Promise.all([
      loadTelegramBot(env, facts.sourceChannelId),
      facts.identityId ? env.DB.prepare(`SELECT value FROM customer_identities WHERE id = ? AND kind = 'telegram'`).bind(facts.identityId).first<{ value: string }>() : null,
    ])
    if (!bot?.enabled) throw new TelegramError('The bot is turned off')
    if (!chat) throw new TelegramError('This Conversation has no Telegram chat')
    const token = await telegramToken(env, bot)
    const text = message.content.trim()
    const captioned = text.length <= 1024 && message.attachments.length > 0
    if (text && !captioned) {
      telegramMessageId = (await telegramCall<{ message_id: number }>(bot.apiBase, token, 'sendMessage', { chat_id: chat.value, text })).message_id
    }
    for (const [index, attachment] of message.attachments.entries()) {
      const object = await env.DB.prepare('SELECT r2_key AS key FROM attachments WHERE id = ?').bind(attachment.id).first<{ key: string }>()
      const file = object ? await fileStorage(env).get(object.key) : null
      if (!file) throw new TelegramError(`${attachment.filename} is no longer stored`)
      const { method, field } = sendMethod(attachment.contentType)
      const form = new FormData()
      form.set('chat_id', chat.value)
      if (index === 0 && captioned && text) form.set('caption', text)
      form.set(field, new Blob([await file.arrayBuffer()], { type: attachment.contentType }), attachment.filename)
      telegramMessageId = (await telegramCall<{ message_id: number }>(bot.apiBase, token, method, form, 120_000)).message_id
    }
  }
  catch (caught) {
    error = caught instanceof TelegramError ? caught.message : 'Telegram did not take the message'
  }
  const status = error ? 'failed' : 'sent'
  await env.DB.prepare('UPDATE customer_telegram_messages SET status = ?, telegram_message_id = ?, error = ? WHERE message_id = ?')
    .bind(status, telegramMessageId, error, message.id).run()
  return { direction: 'outbound', status }
}

/**
 * One long poll for a bot that takes updates by polling. Returns when to ask again in
 * milliseconds, or null when the bot no longer polls. Telegram's refusal is kept on the bot
 * for its settings, and asking again waits as long as Telegram said or a minute.
 */
export async function pollTelegram(env: ZugoidEnv, channelId: string): Promise<number | null> {
  const bot = await loadTelegramBot(env, channelId)
  if (!bot || bot.updates !== 'polling' || !bot.enabled) return null
  try {
    const token = await telegramToken(env, bot)
    const updates = await telegramCall<TelegramUpdate[]>(bot.apiBase, token, 'getUpdates',
      { offset: bot.updateOffset, timeout: POLL_SECONDS, allowed_updates: ['message'] }, (POLL_SECONDS + 10) * 1000)
    for (const update of updates) await takeTelegramUpdate(env, bot, update)
    return 0
  }
  catch (caught) {
    const message = caught instanceof Error ? caught.message : 'Telegram did not answer'
    await env.DB.prepare('UPDATE customer_telegram_bots SET last_error = ?, updated_at = ? WHERE channel_id = ?').bind(message.slice(0, 500), nowIso(), channelId).run()
    return caught instanceof TelegramError && caught.retryAfter ? caught.retryAfter * 1000 : 60_000
  }
}

/**
 * Points Telegram at this Server's webhook, or removes the webhook so the Server can poll.
 * Telegram sends one update at a time to the webhook, so they are taken in order.
 */
export async function routeTelegramUpdates(env: ZugoidEnv, bot: Pick<TelegramBot, 'channelId' | 'apiBase' | 'webhookSecret' | 'updates'>, token: string, origin: string) {
  if (bot.updates === 'webhook') {
    await telegramCall(bot.apiBase, token, 'setWebhook', {
      url: `${origin}/telegram/${bot.channelId}`, secret_token: bot.webhookSecret, allowed_updates: ['message'], max_connections: 1,
    })
  }
  else {
    await telegramCall(bot.apiBase, token, 'deleteWebhook', { drop_pending_updates: false })
  }
}
