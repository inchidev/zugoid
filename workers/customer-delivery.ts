import type { CustomerDeliveryDTO, CustomerSourceKind, MessageDTO } from '../shared/types'
import { eq } from 'drizzle-orm'
import { messages } from '../drizzle/schema'
import { getDb } from '../server/utils/db'
import { hydrateMessages } from '../server/utils/messages'
import { asRpc, type ZugoidEnv } from './env'
import { identityContactTouchStatement, touchConversationStatement } from './customer-records'

/**
 * How a message in a Customer Conversation reaches the outside. The team writes in the
 * Conversation's channel like in any other; a reply also gets its Source's delivery row,
 * stored with the message, and only messages with one ever leave. A note has none.
 */

export type ConversationFacts = {
  channelId: string
  sourceChannelId: string
  sourceKind: CustomerSourceKind
  /** The Identity a Widget or a Telegram bot proved: where a reply goes. */
  identityId: string | null
}

export async function conversationFacts(env: ZugoidEnv, channelId: string): Promise<ConversationFacts | null> {
  return await env.DB.prepare(
    `SELECT cv.channel_id AS channelId, cv.source_channel_id AS sourceChannelId, s.kind AS sourceKind, cv.identity_id AS identityId
     FROM customer_conversations cv JOIN customer_sources s ON s.channel_id = cv.source_channel_id WHERE cv.channel_id = ?`,
  ).bind(channelId).first<ConversationFacts>()
}

/** Only a Widget and a Telegram bot take replies from the channel; email is answered from its Mailbox. */
export function deliversFromChannel(kind: CustomerSourceKind): boolean {
  return kind === 'widget' || kind === 'telegram'
}

/** A Widget reply is delivered once stored: the Visitor reads it from there. Telegram has to take it first. */
export function outboundDelivery(kind: CustomerSourceKind): CustomerDeliveryDTO {
  return { direction: 'outbound', status: kind === 'telegram' ? 'pending' : 'sent' }
}

export const NOTE: CustomerDeliveryDTO = { direction: null, status: null }

/** What a team message in a Conversation writes beside itself: the delivery row of a reply, and the times. */
export function teamMessageStatements(env: ZugoidEnv, facts: ConversationFacts, input: { messageId: string; at: string; deliver: boolean }): D1PreparedStatement[] {
  const statements = [touchConversationStatement(env, { channelId: facts.channelId, at: input.at, inbound: false })]
  if (!input.deliver) return statements
  if (facts.sourceKind === 'widget') {
    statements.push(env.DB.prepare("INSERT INTO customer_widget_messages (message_id, conversation_channel_id, direction, created_at) VALUES (?, ?, 'outbound', ?)")
      .bind(input.messageId, facts.channelId, input.at))
  }
  else if (facts.sourceKind === 'telegram') {
    statements.push(env.DB.prepare("INSERT INTO customer_telegram_messages (message_id, conversation_channel_id, direction, status, created_at) VALUES (?, ?, 'outbound', 'pending', ?)")
      .bind(input.messageId, facts.channelId, input.at))
  }
  if (facts.identityId) statements.push(identityContactTouchStatement(env, { identityId: facts.identityId, at: input.at, inbound: false }))
  return statements
}

/** A message that came in or went out cannot be edited or deleted here: the other side already has it. */
export async function deliveredMessage(env: ZugoidEnv, messageId: string): Promise<boolean> {
  return Boolean(await env.DB.prepare(
    `SELECT 1 AS ok FROM customer_widget_messages WHERE message_id = ?1
     UNION ALL SELECT 1 FROM customer_telegram_messages WHERE message_id = ?1 LIMIT 1`,
  ).bind(messageId).first())
}

/** A message stored outside a channel's socket (a Visitor's, Telegram's) reaches the team's open Conversation. */
export async function fanoutCustomerMessage(env: ZugoidEnv, message: MessageDTO, event: 'message' | 'message.update' = 'message') {
  if (!env.CHANNEL_DO) return
  await asRpc<{ fanout: (value: unknown) => Promise<void> }>(env.CHANNEL_DO.getByName(`channel:${message.channelId}`))
    .fanout({ t: event, message })
    .catch((error: unknown) => console.warn('customer message fanout failed', error))
}

/** A message stored outside the channel's socket, hydrated as the team reads it, to the open Conversation. */
export async function fanoutStoredMessage(env: ZugoidEnv, messageId: string) {
  const rows = await getDb(env.DB).select().from(messages).where(eq(messages.id, messageId))
  const [dto] = await hydrateMessages(env, rows)
  if (dto) await fanoutCustomerMessage(env, dto)
}
