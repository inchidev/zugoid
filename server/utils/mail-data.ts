import { inArray } from 'drizzle-orm'
import { emailMessages, messages } from '../../drizzle/schema'
import type { ZugoidEnv } from '../../workers/env'
import type { AuthorizationContext } from '../../shared/authorization'
import { spaceSql } from '../../shared/spaces'
import type { MailboxDTO, MailMessageDTO, MailThreadDTO } from '../../shared/types'
import { mailThreadUnreadSql, mailAddressList, mailboxGrantPermissionSql } from '../../shared/mail'
import { readableMailContent } from '../../shared/mail-content'
import { mailMarkdownText } from '../../shared/mail-html'
import { splitMailQuote } from '../../shared/mail-quotes'
import { getDb } from './db'
import { mailStatusSql } from '../../workers/customer-records'
import { emailDto, hydrateMessages } from './messages'

export async function hydrateMailMessages(env: ZugoidEnv, rows: Array<typeof messages.$inferSelect>, viewerId: string): Promise<MailMessageDTO[]> {
  if (!rows.length) return []
  const db = getDb(env.DB)
  const [base, extensions] = await Promise.all([
    hydrateMessages(env, rows, viewerId),
    db.select().from(emailMessages).where(inArray(emailMessages.messageId, rows.map(row => row.id))),
  ])
  const byId = new Map(extensions.map(row => [row.messageId, row]))
  return base.map((message) => {
    const email = byId.get(message.id)
    return {
      ...message,
      // Mail is shown as text: inbound HTML and formatted outbound mail alike, then escaped by the view.
      content: email?.direction === 'inbound' ? readableMailContent(message.content) : email?.bodyFormat === 'markdown' ? mailMarkdownText(message.content) : message.content,
      author: email?.direction === 'inbound'
        ? { ...message.author, displayName: email.fromName || email.fromAddress }
        : message.author,
      email: email ? emailDto(email) : null,
    }
  })
}

/** One mail message by id, shaped as the thread view shows it. */
export async function loadMailMessage(env: ZugoidEnv, messageId: string, viewerId: string): Promise<MailMessageDTO | null> {
  const rows = await getDb(env.DB).select().from(messages).where(inArray(messages.id, [messageId]))
  return (await hydrateMailMessages(env, rows, viewerId))[0] ?? null
}

/** An Email Conversation as Mail lists it: `t` is its email row, `cc` its Customer Conversation. */
export const MAIL_THREAD_COLUMNS = `t.channel_id as channelId, t.mailbox_channel_id as mailboxChannelId, t.subject,
  ${mailStatusSql('cc')} as status, t.participants_json as participantsJson, cc.last_message_at as lastMessageAt`
export const MAIL_THREAD_FROM = 'email_threads t JOIN customer_conversations cc ON cc.channel_id = t.channel_id'

type ThreadRow = {
  channelId: string
  mailboxChannelId: string
  subject: string
  status: MailThreadDTO['status']
  participantsJson: string
  lastMessageAt: string
  preview?: string
  previewInbound?: number | boolean
  previewMarkdown?: number | boolean
  unread?: number
}

export function mailThreadDto(row: ThreadRow): MailThreadDTO {
  const preview = row.preview ?? ''
  return {
    channelId: row.channelId,
    mailboxChannelId: row.mailboxChannelId,
    subject: row.subject,
    status: row.status,
    participants: mailAddressList(row.participantsJson),
    preview: (row.previewInbound ? splitMailQuote(readableMailContent(preview)).body : row.previewMarkdown ? mailMarkdownText(preview.slice(0, 2_000)) : preview).slice(0, 240),
    lastMessageAt: row.lastMessageAt,
    unread: Boolean(row.unread),
  }
}

/**
 * Enabled Mailboxes with a grant for the member, and how many Inbox conversations
 * are unread, within the Spaces this context reaches. Callers check the email policy;
 * the channel guard checks each one.
 */
export async function listGrantedMailboxes(env: ZugoidEnv, userId: string, auth: Pick<AuthorizationContext, 'spaces'> = {}): Promise<MailboxDTO[]> {
  const rows = await env.DB.prepare(
    `SELECT mb.channel_id as channelId, mb.display_name as displayName, mb.enabled,
       ${mailboxGrantPermissionSql('a')} AS permission, lower(mb.local_part || '@' || d.domain) as address,
       (SELECT count(*) FROM email_threads t JOIN customer_conversations cc ON cc.channel_id = t.channel_id
        LEFT JOIN channel_reads r ON r.channel_id = t.channel_id AND r.user_id = a.member_id
        WHERE t.mailbox_channel_id = mb.channel_id AND cc.status IN ('open', 'waiting')
          AND ${mailThreadUnreadSql('t', 'r')}) as unreadCount
     FROM email_mailboxes mb
     JOIN email_domains d ON d.id = mb.domain_id
     JOIN grants a ON a.mailbox_id = mb.channel_id
     JOIN channels c ON c.id = mb.channel_id
     WHERE a.member_id = ? AND mb.enabled = 1 AND c.space_id IN (${spaceSql(auth)})
     ORDER BY mb.display_name, address`,
  ).bind(userId).all<MailboxDTO>()
  return rows.results || []
}

/** Marks a conversation read up to a message. Reading only ever moves forward. */
export async function markMailThreadRead(env: ZugoidEnv, threadId: string, userId: string, messageId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO channel_reads (channel_id, user_id, last_read_message_id, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(channel_id, user_id) DO UPDATE SET last_read_message_id = excluded.last_read_message_id, updated_at = excluded.updated_at
     WHERE channel_reads.last_read_message_id IS NULL OR channel_reads.last_read_message_id < excluded.last_read_message_id`,
  ).bind(threadId, userId, messageId, new Date().toISOString()).run()
}
