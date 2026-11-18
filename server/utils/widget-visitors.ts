import type { WidgetVisitorMessageDTO } from '../../shared/types'
import { CUSTOMER_VISITOR_USER_ID, WIDGET_LIMITS, WIDGET_PUBLIC_ID } from '../../shared/customer-widgets'
import { sha256Hex } from '../../shared/server-settings'
import { newId, nowIso } from '../../shared/ids'
import type { ZugoidEnv } from '../../workers/env'
import { browserNameStatement, browserPersonStatements, identityContactTouchStatement, insertConversationStatement, touchConversationStatement } from '../../workers/customer-records'
import { fail } from './cf'
import { randomToken } from './customer-widgets'

/**
 * What a Visitor can do through a Widget, and nothing more. A Visitor is known only by
 * the random token their browser was given; the Server keeps a SHA-256 of it. The token
 * opens that Visitor's own Conversations on that one Widget: never a session, never
 * another route. A Server session is never read here, so a signed-in Member's cookie
 * gives a Widget request no authority either.
 *
 * A Visitor reads only messages with a delivery row in Conversations of their own
 * `browser` Identity. Notes have no delivery row, and a join the team made moves the
 * Contact, not the Identity, so neither ever reaches them.
 */

export type PublicWidget = { channelId: string; spaceId: string; publicId: string; name: string; sites: string[]; greeting: string }

/** An enabled Widget by its public ID; anything else does not exist for the outside. */
export async function findPublicWidget(env: ZugoidEnv, publicId: string): Promise<PublicWidget> {
  const row = WIDGET_PUBLIC_ID.test(publicId)
    ? await env.DB.prepare(
        `SELECT w.channel_id AS channelId, sc.space_id AS spaceId, w.public_id AS publicId, w.name, w.sites_json AS sitesJson, w.greeting
         FROM customer_widgets w JOIN channels sc ON sc.id = w.channel_id WHERE w.public_id = ? AND w.enabled = 1`,
      ).bind(publicId).first<Omit<PublicWidget, 'sites'> & { sitesJson: string }>()
    : null
  if (!row) fail(404, 'not_found', 'Widget not found')
  let sites: string[] = []
  try { sites = (JSON.parse(row.sitesJson) as unknown[]).filter((item): item is string => typeof item === 'string') }
  catch { /* A Widget with unreadable sites is shown nowhere. */ }
  const { sitesJson: _, ...widget } = row
  return { ...widget, sites }
}

/** The bearer token from `Authorization`, or null. Cookies are never read. */
export function bearerToken(authorization: string | undefined | null): string | null {
  const match = /^Bearer\s+([A-Za-z0-9_-]{32,128})$/u.exec(authorization?.trim() ?? '')
  return match?.[1] ?? null
}

export type WidgetVisitor = { id: string; identityId: string }

/** The Visitor holding this token on this Widget. 401 for a token of another Widget or none. */
export async function requireVisitor(env: ZugoidEnv, widget: PublicWidget, token: string | null): Promise<WidgetVisitor> {
  const row = token
    ? await env.DB.prepare('SELECT id, identity_id AS identityId FROM customer_visitors WHERE token_hash = ? AND widget_channel_id = ?')
        .bind(await sha256Hex(token), widget.channelId).first<WidgetVisitor>()
    : null
  if (!row) fail(401, 'unauthorized', 'Start a new chat')
  return row
}

function claimedName(value: string | null | undefined): string | null {
  // Control characters and line breaks never become part of a Contact's name.
  const name = value?.replace(/\p{Cc}+/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, WIDGET_LIMITS.claimedName)
  return name || null
}

function claimedEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase()
  return email && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) ? email : null
}

/**
 * A new Visitor: a token, a `browser` Identity and a Contact of their own, named as they
 * typed or "Visitor" with a number. The token is returned once and never stored.
 */
export async function startVisitorSession(env: ZugoidEnv, widget: PublicWidget, input: { name?: string | null; email?: string | null; userAgent?: string | null; country?: string | null }) {
  const token = randomToken(32)
  const visitorId = newId()
  const identityId = newId()
  const at = nowIso()
  const name = claimedName(input.name)
  const country = /^[A-Z]{2}$/u.test(input.country ?? '') ? input.country! : null
  await env.DB.batch([
    ...browserPersonStatements(env, { sourceChannelId: widget.channelId, visitorId, identityId, name, at }),
    env.DB.prepare(
      `INSERT INTO customer_visitors (id, widget_channel_id, identity_id, token_hash, claimed_name, claimed_email, user_agent, country, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(visitorId, widget.channelId, identityId, await sha256Hex(token), name, claimedEmail(input.email),
      input.userAgent?.slice(0, WIDGET_LIMITS.userAgent) || null, country, at, at),
  ])
  return { token }
}

/** Messages the Visitor may read, oldest first, after a cursor from an earlier answer. */
export async function listVisitorMessages(env: ZugoidEnv, widget: PublicWidget, visitor: WidgetVisitor, after?: string | null): Promise<{ messages: WidgetVisitorMessageDTO[]; cursor: string | null }> {
  const cursor = after && /^\d{1,15}$/u.test(after) ? Number(after) : null
  const rows = await env.DB.prepare(
    `SELECT * FROM (
       SELECT wm.rowid AS seq, m.id, wm.direction, m.content, m.created_at AS createdAt,
         CASE WHEN wm.direction = 'outbound' THEN coalesce(nullif(u.nickname, ''), u.display_name) END AS authorName
       FROM customer_widget_messages wm
       JOIN customer_conversations cv ON cv.channel_id = wm.conversation_channel_id
       JOIN messages m ON m.id = wm.message_id
       JOIN users u ON u.id = m.author_id
       WHERE cv.source_channel_id = ?1 AND cv.identity_id = ?2 AND m.deleted_at IS NULL AND (?3 IS NULL OR wm.rowid > ?3)
       ORDER BY wm.rowid ${cursor === null ? 'DESC' : 'ASC'} LIMIT ${WIDGET_LIMITS.page}
     ) ORDER BY seq`,
  ).bind(widget.channelId, visitor.identityId, cursor).all<WidgetVisitorMessageDTO & { seq: number }>()
  const list = rows.results ?? []
  return {
    messages: list.map(({ seq: _, ...message }) => message),
    cursor: list.length ? String(list.at(-1)!.seq) : after && cursor !== null ? String(cursor) : null,
  }
}

/**
 * A message from the Visitor. It goes into their latest Conversation that is open, waiting or
 * filed as Spam (which stays quiet); after one is resolved or put in Trash, a new one starts.
 * A name or email typed with it is kept as an unverified claim.
 */
export async function postVisitorMessage(env: ZugoidEnv, widget: PublicWidget, visitor: WidgetVisitor, input: { content: string; name?: string | null; email?: string | null }): Promise<WidgetVisitorMessageDTO> {
  const content = input.content.trim()
  if (!content) fail(400, 'bad_request', 'Write a message first')
  if (content.length > WIDGET_LIMITS.message) fail(400, 'bad_request', `A message can be at most ${WIDGET_LIMITS.message} characters`)
  const name = claimedName(input.name)
  const email = claimedEmail(input.email)
  const at = nowIso()
  const existing = await env.DB.prepare(
    `SELECT channel_id AS channelId FROM customer_conversations
     WHERE source_channel_id = ? AND identity_id = ? AND status IN ('open', 'waiting', 'spam')
     ORDER BY last_message_at DESC, channel_id DESC LIMIT 1`,
  ).bind(widget.channelId, visitor.identityId).first<{ channelId: string }>()
  const conversationId = existing?.channelId ?? newId()
  const messageId = newId()
  await env.DB.batch([
    ...existing
      ? [touchConversationStatement(env, { channelId: conversationId, at, inbound: true })]
      : [
          env.DB.prepare(
            `INSERT INTO channels (id, name, topic, type, section, visibility, category_id, position, live_meeting_id, parent_id, parent_message_id, created_at, updated_at)
             VALUES (?, ?, '', 'conversation', 'customers', 'private', NULL, 0, NULL, ?, NULL, ?, ?)`,
          ).bind(conversationId, content.replace(/\s+/gu, ' ').slice(0, 80), widget.channelId, at, at),
          insertConversationStatement(env, { channelId: conversationId, sourceChannelId: widget.channelId, identityId: visitor.identityId, at }),
        ],
    env.DB.prepare(
      `INSERT INTO messages (id, channel_id, author_id, content, reply_to_id, edited_at, deleted_at, created_at)
       VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?)`,
    ).bind(messageId, conversationId, CUSTOMER_VISITOR_USER_ID, content, at),
    env.DB.prepare("INSERT INTO customer_widget_messages (message_id, conversation_channel_id, direction, created_at) VALUES (?, ?, 'inbound', ?)").bind(messageId, conversationId, at),
    identityContactTouchStatement(env, { identityId: visitor.identityId, at, inbound: true }),
    env.DB.prepare('UPDATE customer_visitors SET claimed_name = coalesce(?, claimed_name), claimed_email = coalesce(?, claimed_email), last_seen_at = ? WHERE id = ?')
      .bind(name, email, at, visitor.id),
    ...name
      ? [
          env.DB.prepare('UPDATE customer_identities SET display_name = ?, updated_at = ? WHERE id = ?').bind(name, at, visitor.identityId),
          browserNameStatement(env, { identityId: visitor.identityId, name, at }),
        ]
      : [],
  ])
  return { id: messageId, direction: 'inbound', content, authorName: null, createdAt: at }
}
