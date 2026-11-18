import { mailThreadUnreadSql } from '../../shared/mail'
import { asc, eq } from 'drizzle-orm'
import { messages, users } from '../../drizzle/schema'
import { authorizeMcpCredential, type AuthorizationContext } from '../../shared/authorization'
import type { McpScope } from '../../shared/mcp'
import { readableMailContent } from '../../shared/mail-content'
import type { MailThreadFolder } from '../../shared/paths'
import type { MailboxPermission, MailMessageDTO, MailThreadStatus } from '../../shared/types'
import type { ZugoidEnv } from '../../workers/env'
import { signalMailChanged } from '../../workers/mail-events'
import { requireChannelAccessForMember, requireMemberForUser, type ServerMembership as Membership } from './channel-access'
import { fail } from './cf'
import { getDb } from './db'
import { hydrateMailMessages, listGrantedMailboxes, MAIL_THREAD_COLUMNS, MAIL_THREAD_FROM, mailThreadDto, markMailThreadRead } from './mail-data'
import { conversationStatusForMail } from '../../workers/customer-records'
import { listMailThreads } from './mail-threads'
import { auditStatement, toPublicUser } from './messages'
import { mailboxPermission } from './server-mail'

/**
 * Mail for MCP clients, through the same channel guard and Mailbox grant checks as
 * the Mail HTTP API. Every call resolves the member, Role and grant again.
 */
export async function requireMailMember(env: ZugoidEnv, authorization: AuthorizationContext, scope: Extract<McpScope, `mail:${string}`>) {
  const user = (await getDb(env.DB).select().from(users).where(eq(users.id, authorization.principal.id)).limit(1))[0]
  if (!user) fail(403, 'forbidden', 'Not a member of this server')
  const member = await requireMemberForUser(env, toPublicUser(user), authorization.serverId, undefined, authorization)
  authorizeMcpCredential(member.authorization, scope)
  return member
}

/** The HTTP route's method decides read-only grants: a mutation needs Send, as in the interface. */
async function mailboxAccess(env: ZugoidEnv, member: Membership, channelId: string, needed: MailboxPermission, method = 'GET') {
  return mailboxPermission(await requireChannelAccessForMember(env, member, channelId, undefined, method), needed)
}

async function threadAccess(env: ZugoidEnv, member: Membership, threadId: string, needed: MailboxPermission, method = 'GET') {
  const access = await mailboxAccess(env, member, threadId, needed, method)
  if (access.channel.type !== 'conversation') fail(404, 'not_found', 'Email conversation not found')
  return access
}

function accessDenied(error: unknown) {
  return error instanceof Error && 'statusCode' in error && (error.statusCode === 404 || error.statusCode === 403)
}

/** Enabled Mailboxes holding a grant for the member, each confirmed by the channel guard. */
export async function listMemberMailboxes(env: ZugoidEnv, member: Membership) {
  authorizeMcpCredential(member.authorization, 'mail:read')
  const mailboxes = await Promise.all((await listGrantedMailboxes(env, member.user.id, member.authorization)).map(async ({ enabled: _enabled, ...mailbox }) => {
    try {
      const access = await mailboxAccess(env, member, mailbox.channelId, 'read')
      return { ...mailbox, permission: access.mailPermission, canSend: canSendIn(access), unreadCount: Number(mailbox.unreadCount) }
    }
    catch (error) {
      // The grant or email policy can disappear between the listing and the guard.
      if (accessDenied(error)) return null
      throw error
    }
  }))
  return { mailboxes: mailboxes.filter(mailbox => mailbox !== null) }
}

function canSendIn(access: Parameters<typeof mailboxPermission>[0]) {
  try { mailboxPermission(access, 'send'); return true }
  catch { return false }
}

export async function listMemberMailThreads(env: ZugoidEnv, member: Membership, input: {
  mailboxId: string; folder?: MailThreadFolder; unread?: boolean; query?: string; limit?: number; cursor?: string
}) {
  authorizeMcpCredential(member.authorization, 'mail:read')
  const access = await mailboxAccess(env, member, input.mailboxId, 'read')
  if (access.channel.type !== 'text') fail(404, 'not_found', 'Mailbox not found')
  return listMailThreads(env, { mailboxId: access.mailboxId, userId: member.user.id, folder: input.folder ?? 'inbox',
    before: input.cursor, search: input.query ?? null, unreadOnly: input.unread, limit: input.limit })
}

/** Emails and internal notes as text, without storage keys, file links or reactions. */
function mailMessageOutput(message: MailMessageDTO) {
  return {
    id: message.id,
    kind: message.email ? 'email' as const : 'note' as const,
    author: message.author,
    content: readableMailContent(message.content),
    attachments: message.attachments.map(({ id, filename, contentType, sizeBytes }) => ({ id, filename, contentType, sizeBytes })),
    email: message.email && {
      direction: message.email.direction, fromAddress: message.email.fromAddress, fromName: message.email.fromName,
      to: message.email.to, cc: message.email.cc, bcc: message.email.bcc, replyTo: message.email.replyTo ?? [],
      deliveryStatus: message.email.deliveryStatus, deliveryError: message.email.deliveryError,
    },
    createdAt: message.createdAt,
    editedAt: message.editedAt,
    deleted: Boolean(message.deletedAt),
  }
}

/** One Email Conversation, newest messages first by page. Reading does not mark it read. */
export async function readMemberMailThread(env: ZugoidEnv, member: Membership, threadId: string, input: { limit?: number; cursor?: string } = {}) {
  authorizeMcpCredential(member.authorization, 'mail:read')
  const access = await threadAccess(env, member, threadId, 'read')
  const limit = Math.max(1, Math.min(Math.floor(input.limit ?? 25), 50))
  const [row, rows] = await Promise.all([
    env.DB.prepare(
      `SELECT ${MAIL_THREAD_COLUMNS}, ${mailThreadUnreadSql('t', 'r')} as unread
       FROM ${MAIL_THREAD_FROM} LEFT JOIN channel_reads r ON r.channel_id = t.channel_id AND r.user_id = ?
       WHERE t.channel_id = ?`,
    ).bind(member.user.id, threadId).first<Parameters<typeof mailThreadDto>[0]>(),
    getDb(env.DB).select().from(messages).where(eq(messages.channelId, threadId)).orderBy(asc(messages.createdAt), asc(messages.id)),
  ])
  if (!row) fail(404, 'not_found', 'Email conversation not found')
  const end = input.cursor ? rows.findIndex(message => message.id === input.cursor) : rows.length
  if (end < 0) fail(400, 'bad_cursor', 'Unknown cursor for this conversation')
  const page = rows.slice(Math.max(0, end - limit), end)
  const hydrated = await hydrateMailMessages(env, page, member.user.id)
  const { preview: _preview, ...thread } = mailThreadDto({ ...row, preview: '' })
  return {
    thread: { ...thread, canSend: canSendIn(access) },
    messages: hydrated.map(mailMessageOutput),
    nextCursor: end - limit > 0 ? page[0]?.id ?? null : null,
  }
}

/** Marks the whole conversation read for the member, like opening it in Mail. */
export async function markMemberMailThreadRead(env: ZugoidEnv, member: Membership, threadId: string) {
  authorizeMcpCredential(member.authorization, 'mail:write')
  await threadAccess(env, member, threadId, 'read', 'POST')
  const latest = await env.DB.prepare('SELECT max(id) as id FROM messages WHERE channel_id = ?')
    .bind(threadId).first<{ id: string | null }>()
  if (latest?.id) await markMailThreadRead(env, threadId, member.user.id, latest.id)
  return { ok: true, lastReadMessageId: latest?.id ?? null }
}

export async function moveMemberMailThread(env: ZugoidEnv, member: Membership, threadId: string, status: MailThreadStatus, schedule: (promise: Promise<unknown>) => void) {
  authorizeMcpCredential(member.authorization, 'mail:write')
  const access = await threadAccess(env, member, threadId, 'send', 'PATCH')
  const now = new Date().toISOString()
  await env.DB.batch([
    env.DB.prepare('UPDATE customer_conversations SET status = ?, updated_at = ? WHERE channel_id = ?').bind(conversationStatusForMail(status), now, threadId),
    await auditStatement(env, { serverId: member.serverId, actorId: member.user.id, action: 'mail_thread.move', targetType: 'email_thread',
      targetId: threadId, meta: { status }, authorization: member.authorization }),
  ])
  schedule(signalMailChanged(env, access.mailboxId, threadId))
  return { ok: true, threadId, status }
}
