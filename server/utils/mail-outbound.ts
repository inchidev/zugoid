import type { ZugoidEnv } from '../../workers/env'
import { sendServerEmail, type ServerEmailAttachment } from '../../workers/mail-transport'
import { fileStorage } from '../../shared/file-storage'
import { MAIL_FILES_UNAVAILABLE, mailFilesAvailable } from '../../shared/mail-attachments'
import { mailHtmlText, mailMarkdownHtml } from '../../shared/mail-html'
import { mailAddressList, mailReplyRecipients, mailDeliveryUncertain, mergeMailAddresses } from '../../shared/mail'
import { emailPersonStatements } from '../../workers/customer-records'

type OutboundRow = {
  messageId: string
  threadChannelId: string
  isReply: number
  fromAddress: string
  fromName: string | null
  toJson: string
  ccJson: string
  bccJson: string
  inReplyTo: string | null
  referencesJson: string
  deliveryStatus: 'pending' | 'sent' | 'failed'
  deliveryAttempts: number
  deliveryStartedAt: string | null
  createdAt: string
  content: string
  subject: string
  bodyFormat: 'text' | 'markdown'
}

/** A single-line, bounded summary of a transport error, kept for the sender to see. */
function deliveryError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text.replace(/\s+/gu, ' ').trim().slice(0, 500) || 'Delivery failed'
}

/**
 * Delivers one outbound email and records the outcome. Only one caller can
 * deliver a message at a time: an attempt first claims the row, which succeeds
 * for a message never attempted or one whose last attempt failed. A message
 * that is already sent, or being sent by another request, is left alone.
 */
export async function deliverOutboundEmail(env: ZugoidEnv, messageId: string, options: { retryUncertain?: boolean } = {}): Promise<void> {
  const row = await env.DB.prepare(
    `SELECT em.message_id as messageId, em.thread_channel_id as threadChannelId,
       EXISTS (SELECT 1 FROM email_messages earlier WHERE earlier.thread_channel_id = em.thread_channel_id
         AND (earlier.created_at < em.created_at OR (earlier.created_at = em.created_at AND earlier.message_id < em.message_id))) as isReply,
       em.from_address as fromAddress, em.from_name as fromName, em.to_json as toJson, em.cc_json as ccJson, em.bcc_json as bccJson,
       em.in_reply_to as inReplyTo, em.references_json as referencesJson,
       em.delivery_status as deliveryStatus, em.delivery_attempts as deliveryAttempts,
       em.delivery_started_at as deliveryStartedAt, em.created_at as createdAt, em.body_format as bodyFormat,
       m.content, t.subject
     FROM email_messages em
     JOIN messages m ON m.id = em.message_id
     JOIN email_threads t ON t.channel_id = em.thread_channel_id
     WHERE em.message_id = ? AND em.direction = 'outbound'`,
  ).bind(messageId).first<OutboundRow>()
  if (!row) return

  const started = new Date().toISOString()
  const uncertain = mailDeliveryUncertain(row)
  const claim = await env.DB.prepare(
    `UPDATE email_messages SET delivery_status = 'pending', delivery_attempts = delivery_attempts + 1, delivery_error = NULL, delivery_started_at = ?
     WHERE message_id = ? AND delivery_attempts = ?
       AND ((delivery_status = 'pending' AND delivery_attempts = 0) OR delivery_status = 'failed' OR (delivery_status = 'pending' AND ? = 1))`,
  ).bind(started, messageId, row.deliveryAttempts, options.retryUncertain && uncertain ? 1 : 0).run()
  if (!claim.meta.changes) return

  // Every email after the one that started the conversation is a reply.
  const isReply = Boolean(row.isReply)
  const references = parseReferences(row.referencesJson)
  let result: Awaited<ReturnType<typeof sendServerEmail>>
  try {
    const attachments = await outboundAttachments(env, messageId)
    const html = row.bodyFormat === 'markdown' ? mailMarkdownHtml(row.content) : null
    result = await sendServerEmail(env, {
      from: row.fromName ? { email: row.fromAddress, name: row.fromName } : row.fromAddress,
      to: mailAddressList(row.toJson),
      ...(mailAddressList(row.ccJson).length ? { cc: mailAddressList(row.ccJson) } : {}),
      ...(mailAddressList(row.bccJson).length ? { bcc: mailAddressList(row.bccJson) } : {}),
      subject: isReply && !/^re:/iu.test(row.subject) ? `Re: ${row.subject}` : row.subject,
      // Formatted mail always carries a text/plain alternative.
      ...(html ? { html, text: mailHtmlText(html) } : { text: row.content }),
      ...(attachments.length ? { attachments } : {}),
      headers: {
        ...(isRfcMessageId(row.inReplyTo) ? { 'In-Reply-To': row.inReplyTo } : {}),
        ...(references.length ? { References: references.join(' ') } : {}),
      },
    })
  }
  catch (error) {
    await env.DB.prepare("UPDATE email_messages SET delivery_status = 'failed', delivery_error = ? WHERE message_id = ? AND delivery_attempts = ?")
      .bind(deliveryError(error), messageId, row.deliveryAttempts + 1).run()
    return
  }
  // A receipt failure is uncertain delivery, never a known send failure. Retrying
  // needs an explicit human decision because the recipient may already have it.
  await env.DB.prepare(
    `UPDATE email_messages SET delivery_status = 'sent', provider_message_id = ?, rfc_message_id = ?, delivered_at = ?, delivery_error = NULL
     WHERE message_id = ? AND delivery_attempts = ?`,
  ).bind(result.messageId, isRfcMessageId(result.messageId) ? result.messageId : null, new Date().toISOString(), messageId, row.deliveryAttempts + 1).run()
}

function base64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  return btoa(binary)
}

/** The files stored on an outbound email, read back for each delivery attempt. */
async function outboundAttachments(env: ZugoidEnv, messageId: string): Promise<ServerEmailAttachment[]> {
  const rows = (await env.DB.prepare(
    'SELECT r2_key as r2Key, filename, content_type as contentType FROM attachments WHERE message_id = ? ORDER BY created_at, id',
  ).bind(messageId).all<{ r2Key: string; filename: string; contentType: string }>()).results ?? []
  if (!rows.length) return []
  if (!mailFilesAvailable(env)) throw new Error(MAIL_FILES_UNAVAILABLE)
  const files = fileStorage(env)
  return Promise.all(rows.map(async (row) => {
    const object = await files.get(row.r2Key)
    if (!object) throw new Error(`Attachment ${row.filename} is no longer available`)
    return { filename: row.filename, type: row.contentType, content: base64(new Uint8Array(await object.arrayBuffer())), disposition: 'attachment' as const }
  }))
}

function isRfcMessageId(value: string | null): value is string {
  return Boolean(value && /^<[^<>\s@]+@[^<>\s@]+>$/u.test(value))
}

function parseReferences(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? [...new Set(parsed.filter((item): item is string => typeof item === 'string' && isRfcMessageId(item)))] : []
  }
  catch {
    return []
  }
}

/**
 * Reply uses Reply-To, falling back to the latest sender. Reply all also
 * includes To and Cc, excluding the mailbox itself. A conversation that
 * has only outbound mail replies to the people it was sent to.
 */
export async function replyRecipients(env: ZugoidEnv, threadId: string, mailboxAddress: string, mode: 'reply' | 'all' = 'reply'): Promise<string[]> {
  const [inbound, thread] = await Promise.all([
    env.DB.prepare(
      `SELECT from_address as fromAddress, reply_to_json as replyToJson, to_json as toJson, cc_json as ccJson FROM email_messages
       WHERE thread_channel_id = ? AND direction = 'inbound' ORDER BY created_at DESC LIMIT 1`,
    ).bind(threadId).first<{ fromAddress: string; replyToJson: string; toJson: string; ccJson: string }>(),
    env.DB.prepare('SELECT participants_json as participantsJson FROM email_threads WHERE channel_id = ?')
      .bind(threadId).first<{ participantsJson: string }>(),
  ])
  return mailReplyRecipients(inbound ? {
    fromAddress: inbound.fromAddress,
    replyTo: mailAddressList(inbound.replyToJson),
    to: mailAddressList(inbound.toJson),
    cc: mailAddressList(inbound.ccJson),
  } : null, mailAddressList(thread?.participantsJson), mailboxAddress, mode === 'all')
}

/** The Message-ID a reply answers and the References chain it continues. */
export async function replyThreading(env: ZugoidEnv, threadId: string): Promise<{ inReplyTo: string | null; references: string[] }> {
  const previous = await env.DB.prepare(
    `SELECT rfc_message_id as rfcMessageId, references_json as referencesJson FROM email_messages
     WHERE thread_channel_id = ? AND rfc_message_id LIKE '<%@%>' ORDER BY created_at DESC LIMIT 1`,
  ).bind(threadId).first<{ rfcMessageId: string; referencesJson: string }>()
  if (!previous || !isRfcMessageId(previous.rfcMessageId)) return { inReplyTo: null, references: [] }
  return {
    inReplyTo: previous.rfcMessageId,
    references: [...new Set([...parseReferences(previous.referencesJson), previous.rfcMessageId])],
  }
}

/**
 * The email a delivered reply in a Mailbox's Conversation becomes, as statements for the caller's
 * batch, so the message and its email row are stored together or not at all. The recipient set is
 * the mail reply default: Reply-To of the latest inbound, else the conversation's participants.
 * Chat's composer writes Markdown, so the reply goes out as formatted mail.
 */
export async function channelMailReplyStatements(env: ZugoidEnv, input: { mailboxChannelId: string; threadChannelId: string; messageId: string; at: string; clientId?: string | null }): Promise<D1PreparedStatement[]> {
  const [mailbox, threading, participants] = await Promise.all([
    env.DB.prepare(
      `SELECT lower(mb.local_part || '@' || d.domain) as address, mb.display_name as displayName
       FROM email_mailboxes mb JOIN email_domains d ON d.id = mb.domain_id WHERE mb.channel_id = ?`,
    ).bind(input.mailboxChannelId).first<{ address: string; displayName: string | null }>(),
    replyThreading(env, input.threadChannelId),
    env.DB.prepare('SELECT participants_json AS json FROM email_threads WHERE channel_id = ?').bind(input.threadChannelId).first<{ json: string }>(),
  ])
  if (!mailbox) return []
  const recipients = await replyRecipients(env, input.threadChannelId, mailbox.address, 'reply')
  if (!recipients.length) return []
  const nextParticipants = mergeMailAddresses(mailAddressList(participants?.json), recipients)
  return [
    env.DB.prepare(
      `INSERT INTO email_messages
       (message_id, thread_channel_id, mailbox_channel_id, direction, from_address, from_name, to_json, cc_json, bcc_json,
        rfc_message_id, in_reply_to, references_json, delivery_status, raw_r2_key, client_request_id, created_at, body_format)
       VALUES (?, ?, ?, 'outbound', ?, ?, ?, '[]', '[]', NULL, ?, ?, 'pending', NULL, ?, ?, 'markdown')`,
    ).bind(
      input.messageId, input.threadChannelId, input.mailboxChannelId, mailbox.address, mailbox.displayName,
      JSON.stringify(recipients), threading.inReplyTo, JSON.stringify(threading.references), input.clientId ?? null, input.at,
    ),
    env.DB.prepare('UPDATE email_threads SET participants_json = ?, updated_at = ? WHERE channel_id = ?')
      .bind(JSON.stringify(nextParticipants), input.at, input.threadChannelId),
    ...recipients.flatMap(address => emailPersonStatements(env, { sourceChannelId: input.mailboxChannelId, address, at: input.at, direction: 'outbound' })),
  ]
}
