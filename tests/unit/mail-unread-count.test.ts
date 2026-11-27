import { DatabaseSync } from 'node:sqlite'
import { QueryClient } from '@tanstack/vue-query'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { applyServerRealtimeEvent } from '../../app/utils/server-realtime'
import { d1 } from '../helpers/sqlite-d1'
import { listGrantedMailboxes } from '../../server/utils/mail-data'
import { Permission } from '../../shared/permissions'
import type { ServerRealtimeEvent } from '../../shared/server-realtime'
import { DEFAULT_SPACE_ID } from '../../shared/spaces'
import { signalChannelRead } from '../../workers/channel-activity'
import { advanceChatRead } from '../../workers/chat-attention'
import type { ZugoidEnv } from '../../workers/env'

let db: DatabaseSync, env: ZugoidEnv
beforeEach(() => {
  db = new DatabaseSync(':memory:')
  db.exec(`CREATE TABLE email_domains(id TEXT, domain TEXT);
    CREATE TABLE email_mailboxes(channel_id TEXT, domain_id TEXT, local_part TEXT, display_name TEXT, enabled INTEGER);
    CREATE TABLE grants(member_id TEXT, mailbox_id TEXT, permissions INTEGER);
    CREATE TABLE email_threads(channel_id TEXT, mailbox_channel_id TEXT);
    CREATE TABLE customer_conversations(channel_id TEXT, status TEXT);
    CREATE TABLE email_messages(message_id TEXT, thread_channel_id TEXT, direction TEXT);
    CREATE TABLE channel_reads(channel_id TEXT, user_id TEXT, last_read_message_id TEXT, updated_at TEXT, PRIMARY KEY (channel_id, user_id));
    CREATE TABLE channel_attention(channel_id TEXT, user_id TEXT, following INTEGER, read_generation INTEGER);
    CREATE TABLE channels(id TEXT, space_id TEXT, name TEXT, type TEXT, visibility TEXT, parent_id TEXT);
    CREATE TABLE messages(id TEXT, channel_id TEXT, deleted_at TEXT);
    CREATE TABLE server_identity(singleton INTEGER PRIMARY KEY, id TEXT);
    INSERT INTO server_identity VALUES(1, '00000000-0000-4000-8000-000000000001');
    INSERT INTO channels VALUES ('box', '${DEFAULT_SPACE_ID}', 'Test mailbox', 'text', 'private', NULL);
    INSERT INTO email_domains VALUES ('d', 'example.com');
    INSERT INTO email_mailboxes VALUES ('box', 'd', 'hello', 'Hello', 1);`)
  db.prepare('INSERT INTO grants VALUES (?, ?, ?)').run('me', 'box', Permission.readMail)
  env = { DB: d1(db) } as unknown as ZugoidEnv
})
afterEach(() => db.close())

function thread(id: string, messages: Array<[string, 'inbound' | 'outbound']>, status = 'open') {
  db.prepare('INSERT INTO email_threads VALUES (?, ?)').run(id, 'box')
  db.prepare('INSERT INTO customer_conversations VALUES (?, ?)').run(id, status)
  for (const [message, direction] of messages) db.prepare('INSERT INTO email_messages VALUES (?, ?, ?)').run(message, id, direction)
}
const unread = async () => (await listGrantedMailboxes(env, 'me'))[0]?.unreadCount

it('does not count an email you sent and never opened', async () => {
  thread('sent', [['m1', 'outbound']])
  expect(await unread()).toBe(0)
})

it('counts a conversation with an inbound email nobody read', async () => {
  thread('new', [['m1', 'inbound']])
  expect(await unread()).toBe(1)
})

it('counts it again only when a newer inbound email arrives', async () => {
  thread('t', [['m1', 'inbound'], ['m2', 'outbound']])
  db.prepare('INSERT INTO channel_reads (channel_id, user_id, last_read_message_id) VALUES (?, ?, ?)').run('t', 'me', 'm1')
  expect(await unread()).toBe(0)
  db.prepare('INSERT INTO email_messages VALUES (?, ?, ?)').run('m3', 't', 'inbound')
  expect(await unread()).toBe(1)
})

it('ignores conversations outside the Inbox', async () => {
  thread('old', [['m1', 'inbound']], 'resolved')
  expect(await unread()).toBe(0)
})

it('refreshes the Inbox row and badge after a read, only for the member who opened the email', async () => {
  thread('t', [['m1', 'inbound']])
  db.prepare('INSERT INTO channels VALUES (?, ?, ?, ?, ?, ?)').run('t', DEFAULT_SPACE_ID, 'Email', 'conversation', 'private', 'box')
  db.prepare('INSERT INTO messages VALUES (?, ?, NULL)').run('m1', 't')
  db.prepare('INSERT INTO grants VALUES (?, ?, ?)').run('colleague', 'box', Permission.readMail)
  const cache = new QueryClient()
  const mailboxKey = ['mailboxes']
  const listKey = ['mail-threads', 'box', 'inbox', '']
  const otherListKey = ['mail-threads', 'other-box', 'inbox', '']
  cache.setQueryData(mailboxKey, { mailboxes: await listGrantedMailboxes(env, 'me') })
  cache.setQueryData(listKey, { pages: [{ threads: [{ channelId: 't', unread: true }] }] })
  cache.setQueryData(otherListKey, { pages: [] })
  const deliver = (event: ServerRealtimeEvent) => applyServerRealtimeEvent(cache, event)
  const notified: string[] = []
  Object.assign(env, { SERVER_DO: { getByName: () => ({
    notifyMailChanged: (event: ServerRealtimeEvent, userIds: string[]) => { notified.push(...userIds); deliver(event) },
    notifyChannelRead: (event: ServerRealtimeEvent, userId: string) => { notified.push(userId); deliver(event) },
  }) } })

  expect(await unread()).toBe(1)
  await advanceChatRead(env.DB, 't', 'me', 'm1', '2026-11-27T00:00:00.000Z', 0).run()
  await signalChannelRead(env, 'me', 't', 'm1')

  expect(await unread()).toBe(0)
  expect((await listGrantedMailboxes(env, 'colleague'))[0]?.unreadCount).toBe(1)
  expect(notified).toEqual(['me'])
  expect(cache.getQueryState(mailboxKey)?.isInvalidated).toBe(true)
  expect(cache.getQueryState(listKey)?.isInvalidated).toBe(true)
  expect(cache.getQueryState(otherListKey)?.isInvalidated).toBe(false)
})
