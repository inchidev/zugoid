import { DatabaseSync } from 'node:sqlite'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb, INIT_SQL } from '../../server/utils/db'
import type { ServerMembership } from '../../server/utils/channel-access'
import { connectTelegramBot, deleteTelegramBot, listTelegramBots, setTelegramBotMembers, telegramApiBase, updateTelegramBot } from '../../server/utils/customer-telegram-bots'
import { listSourceConversations, readCustomerConversation } from '../../server/utils/customer-widgets'
import { hydrateMessages } from '../../server/utils/messages'
import { messages } from '../../drizzle/schema'
import { ALL_PERMISSIONS } from '../../shared/permissions'
import { DEFAULT_SPACE_ID } from '../../shared/spaces'
import { conversationFacts, deliveredMessage, teamMessageStatements } from '../../workers/customer-delivery'
import { loadTelegramBot, pollTelegram, sendTelegramReply, takeTelegramUpdate } from '../../workers/customer-telegram'
import type { ZugoidEnv } from '../../workers/env'
import { d1 } from '../helpers/sqlite-d1'

const TOKEN = '123456789:AAEhBOweik6ad9r_QXMENQjcrGbqCr4K-ab'
let sqlite: DatabaseSync
let env: ZugoidEnv
let files: Map<string, Uint8Array>
let calls: Array<{ method: string; body: Record<string, unknown> }>
let refuse: Record<string, string>
let polling: string[]
let fanouts: unknown[]

function member(id: string, perms = 0, isOwner = false): ServerMembership {
  return {
    user: { id }, serverId: '00000000-0000-4000-8000-000000000001', ownerId: 'owner', isOwner, perms,
    authorization: { principal: { id, kind: 'human' }, credential: { kind: 'session' }, spaces: { ids: [DEFAULT_SPACE_ID], active: DEFAULT_SPACE_ID, denied: {} } },
  } as unknown as ServerMembership
}
const owner = () => member('owner', ALL_PERMISSIONS, true)

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec(INIT_SQL)
  sqlite.exec(`
    INSERT INTO roles (id, key, name, permissions_bitmask) VALUES ('member', 'member', 'Member', ${ALL_PERMISSIONS});
    INSERT INTO users (id, display_name, status, role_id, joined_at) VALUES ('owner', 'Owner', 'active', 'member', '2026-09-01T00:00:00.000Z'),
      ('agent-smith', 'Smith', 'active', 'member', '2026-09-01T00:00:00.000Z');
    INSERT INTO server_identity(singleton,id) VALUES(1,'00000000-0000-4000-8000-000000000001');
    INSERT INTO server(id,name,owner_id) VALUES('00000000-0000-4000-8000-000000000001','Telegram test','owner');
  `)
  files = new Map()
  calls = []
  refuse = {}
  polling = []
  fanouts = []
  env = {
    DB: d1(sqlite),
    AUTH_SECRET: 'test-only-server-secret-with-32-characters',
    PUBLIC_ORIGIN: 'https://team.example',
    FILES: {
      put: async (key: string, value: Uint8Array) => { files.set(key, new Uint8Array(value)) },
      get: async (key: string) => {
        const bytes = files.get(key)
        return bytes ? { size: bytes.byteLength, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) } : null
      },
    },
    CHANNEL_DO: {
      getByName: (name: string) => ({
        startTelegramPolling: async () => { polling.push(name) },
        fanout: async (value: unknown) => { fanouts.push(value) },
      }),
    },
  } as unknown as ZugoidEnv
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init: RequestInit = {}) => {
    const address = new URL(String(url))
    if (address.pathname.startsWith('/file/')) return new Response(new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]))
    const method = address.pathname.split('/').at(-1)!
    expect(address.pathname).toContain(`/bot${TOKEN}/`)
    const body = init.body instanceof FormData ? Object.fromEntries(init.body.entries()) : JSON.parse(String(init.body || '{}'))
    calls.push({ method, body })
    if (refuse[method]) return Response.json({ ok: false, error_code: 400, description: refuse[method] })
    const result: Record<string, unknown> = {
      getMe: { id: 123456789, is_bot: true, username: 'acme_help_bot' },
      setWebhook: true,
      deleteWebhook: true,
      getFile: { file_path: 'photos/file_1.jpg' },
      getUpdates: [],
    }
    return Response.json({ ok: true, result: result[method] ?? { message_id: 900 + calls.length } })
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  sqlite.close()
})

async function bot(updates: 'webhook' | 'polling' = 'webhook') {
  const { channelId } = await connectTelegramBot(env, owner(), { spaceId: DEFAULT_SPACE_ID, token: TOKEN, updates, greeting: 'Hi from Acme' })
  return (await loadTelegramBot(env, channelId))!
}

const from = { id: 4242, is_bot: false, first_name: 'Vasya', last_name: 'Pupkin', username: 'vasya' }
const update = (id: number, message: Record<string, unknown>) => ({ update_id: id, message: { message_id: id * 10, from, chat: { id: 4242, type: 'private' }, ...message } })

async function teamReads(conversationId: string) {
  return hydrateMessages(env, await getDb(env.DB).select().from(messages).where(eq(messages.channelId, conversationId)).orderBy(messages.id), 'owner')
}

describe('connecting a Telegram bot', () => {
  it('checks the token with Telegram, keeps it encrypted and points the webhook at the Server', async () => {
    const connected = await bot()
    expect(connected).toMatchObject({ botId: '123456789', username: 'acme_help_bot', updates: 'webhook', apiBase: 'https://api.telegram.org' })
    expect(connected.tokenCiphertext).not.toContain('AAEh')
    expect(calls.find(call => call.method === 'setWebhook')!.body).toMatchObject({
      url: `https://team.example/telegram/${connected.channelId}`, secret_token: connected.webhookSecret, max_connections: 1,
    })
    expect(sqlite.prepare("SELECT kind FROM customer_sources WHERE channel_id = ?").get(connected.channelId)).toEqual({ kind: 'telegram' })
    expect(sqlite.prepare('SELECT section FROM channels WHERE id = ?').get(connected.channelId)).toEqual({ section: 'customers' })
    await expect(connectTelegramBot(env, owner(), { spaceId: DEFAULT_SPACE_ID, token: TOKEN, updates: 'webhook' })).rejects.toMatchObject({ statusCode: 409 })
  })

  it('polls instead, from the bot channel object, for a Server Telegram cannot reach', async () => {
    const connected = await bot('polling')
    expect(calls.map(call => call.method)).toEqual(['getMe', 'deleteWebhook'])
    expect(polling).toEqual([`channel:${connected.channelId}`])
    expect(await pollTelegram(env, connected.channelId)).toBe(0)
    expect(calls.at(-1)).toMatchObject({ method: 'getUpdates', body: { offset: 0, timeout: 25 } })
    await updateTelegramBot(env, owner(), connected.channelId, { enabled: false })
    expect(await pollTelegram(env, connected.channelId)).toBeNull()
  })

  it('refuses a token Telegram does not confirm and leaves nothing half connected', async () => {
    refuse.getMe = 'Unauthorized'
    await expect(connectTelegramBot(env, owner(), { spaceId: DEFAULT_SPACE_ID, token: TOKEN, updates: 'webhook' })).rejects.toMatchObject({ statusCode: 400 })
    delete refuse.getMe
    refuse.setWebhook = 'bad webhook: HTTPS url must be provided for webhook'
    await expect(connectTelegramBot(env, owner(), { spaceId: DEFAULT_SPACE_ID, token: TOKEN, updates: 'webhook' })).rejects.toMatchObject({ statusCode: 400 })
    expect(sqlite.prepare('SELECT count(*) AS n FROM customer_telegram_bots').get()).toEqual({ n: 0 })
    await expect(connectTelegramBot(env, member('agent-smith'), { spaceId: DEFAULT_SPACE_ID, token: TOKEN, updates: 'webhook' })).rejects.toMatchObject({ statusCode: 403 })
  })

  it('takes only an https Bot API address without credentials', () => {
    expect(telegramApiBase('')).toBe('https://api.telegram.org')
    expect(telegramApiBase('https://tg-proxy.example.ru/')).toBe('https://tg-proxy.example.ru')
    expect(() => telegramApiBase('http://tg.example')).toThrow()
    expect(() => telegramApiBase('https://user:pass@tg.example')).toThrow()
  })
})

describe('messages from Telegram', () => {
  it('starts a Conversation with a verified Contact, takes each update once and greets on /start', async () => {
    const connected = await bot()
    await takeTelegramUpdate(env, connected, update(1, { text: '/start' }))
    expect(calls.at(-1)).toMatchObject({ method: 'sendMessage', body: { chat_id: 4242, text: 'Hi from Acme' } })
    expect(sqlite.prepare('SELECT count(*) AS n FROM customer_conversations').get()).toEqual({ n: 0 })

    await takeTelegramUpdate(env, (await loadTelegramBot(env, connected.channelId))!, update(2, { text: 'Where is my order?' }))
    await takeTelegramUpdate(env, connected, update(2, { text: 'Where is my order?' }))
    const [conversation] = await listSourceConversations(env, owner(), connected.channelId, 'open')
    expect(conversation).toMatchObject({ contactName: 'Vasya Pupkin', preview: 'Where is my order?' })
    expect(sqlite.prepare("SELECT kind, value, verified_by FROM customer_identities").all()).toEqual([{ kind: 'telegram', value: '4242', verified_by: 'telegram' }])
    expect((await teamReads(conversation!.channelId)).map(message => [message.content, message.author.displayName, message.customer?.direction]))
      .toEqual([['Where is my order?', 'Vasya Pupkin', 'inbound']])
    expect(fanouts).toHaveLength(1)
    expect((await readCustomerConversation(env, owner(), conversation!.channelId)).telegram).toEqual({ userId: '4242', name: 'Vasya Pupkin' })
  })

  it('brings a photo over as an attachment and names what it cannot show', async () => {
    const connected = await bot()
    await takeTelegramUpdate(env, connected, update(3, { caption: 'Broken', photo: [{ file_id: 'small', width: 90, height: 90 }, { file_id: 'big', width: 800, height: 600, file_size: 6 }] }))
    await takeTelegramUpdate(env, (await loadTelegramBot(env, connected.channelId))!, update(4, { document: { file_id: 'doc', file_name: 'invoice.pdf' } }))
    const [conversation] = await listSourceConversations(env, owner(), connected.channelId, 'open')
    const [photo, document] = await teamReads(conversation!.channelId)
    expect(calls.find(call => call.method === 'getFile')!.body).toEqual({ file_id: 'big' })
    expect(photo).toMatchObject({ content: 'Broken', attachments: [expect.objectContaining({ contentType: 'image/jpeg', width: 800, height: 600 })] })
    expect(document!.content).toContain('invoice.pdf')
    expect(files.size).toBe(1)
  })

  it('shows the bot only to the team that answers it', async () => {
    const connected = await bot()
    await takeTelegramUpdate(env, connected, update(5, { text: 'Hello' }))
    await expect(listSourceConversations(env, member('agent-smith'), connected.channelId, 'open')).rejects.toMatchObject({ statusCode: 404 })
    expect(await listTelegramBots(env, member('agent-smith'))).toEqual([])
    await setTelegramBotMembers(env, owner(), connected.channelId, ['agent-smith'])
    expect(await listSourceConversations(env, member('agent-smith'), connected.channelId, 'open')).toHaveLength(1)
    expect(await listTelegramBots(env, member('agent-smith'))).toEqual([expect.objectContaining({ username: 'acme_help_bot', lastError: null, canManage: false })])
  })
})

describe('replies to Telegram', () => {
  async function conversation() {
    const connected = await bot()
    await takeTelegramUpdate(env, connected, update(6, { text: 'Help' }))
    return (await listSourceConversations(env, owner(), connected.channelId, 'open'))[0]!.channelId
  }
  async function write(conversationId: string, content: string, deliver: boolean) {
    const facts = (await conversationFacts(env, conversationId))!
    const id = `team-${content.length}-${deliver}`
    await env.DB.batch([
      env.DB.prepare("INSERT INTO messages (id, channel_id, author_id, content, created_at) VALUES (?, ?, 'owner', ?, '2026-11-20T00:00:00.000Z')").bind(id, conversationId, content),
      ...teamMessageStatements(env, facts, { messageId: id, at: '2026-11-20T00:00:00.000Z', deliver }),
    ])
    return { facts, message: (await teamReads(conversationId)).find(message => message.id === id)! }
  }

  it('sends a reply to the chat it came from and records it sent; a note never goes', async () => {
    const id = await conversation()
    const note = await write(id, 'VIP, be nice', false)
    expect(note.message.customer).toEqual({ direction: null, status: null })
    const reply = await write(id, 'On its way', true)
    expect(reply.message.customer).toEqual({ direction: 'outbound', status: 'pending' })
    expect(await sendTelegramReply(env, reply.facts, reply.message)).toEqual({ direction: 'outbound', status: 'sent' })
    expect(calls.filter(call => call.method === 'sendMessage').map(call => call.body)).toEqual([{ chat_id: '4242', text: 'On its way' }])
    expect(sqlite.prepare('SELECT status, telegram_message_id IS NOT NULL AS has FROM customer_telegram_messages WHERE message_id = ?').get(reply.message.id)).toEqual({ status: 'sent', has: 1 })
    expect(await deliveredMessage(env, reply.message.id)).toBe(true)
    expect(await deliveredMessage(env, note.message.id)).toBe(false)
  })

  it('records Telegram’s refusal on the reply', async () => {
    const id = await conversation()
    refuse.sendMessage = 'Forbidden: bot was blocked by the user'
    const reply = await write(id, 'Hello?', true)
    expect(await sendTelegramReply(env, reply.facts, reply.message)).toEqual({ direction: 'outbound', status: 'failed' })
    expect(sqlite.prepare('SELECT error FROM customer_telegram_messages WHERE message_id = ?').get(reply.message.id)).toEqual({ error: 'Forbidden: bot was blocked by the user' })
  })

  it('removes the bot and its Conversations but keeps the Contact', async () => {
    const id = await conversation()
    const channelId = (await conversationFacts(env, id))!.sourceChannelId
    await deleteTelegramBot(env, owner(), channelId)
    expect(calls.at(-1)!.method).toBe('deleteWebhook')
    expect(sqlite.prepare('SELECT count(*) AS n FROM customer_conversations').get()).toEqual({ n: 0 })
    expect(sqlite.prepare('SELECT count(*) AS n FROM customer_contacts').get()).toEqual({ n: 1 })
  })
})
