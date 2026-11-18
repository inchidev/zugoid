import type { CustomerConversationDetailDTO, CustomerConversationStatus, CustomerMessageDTO, CustomerWidgetConversationDTO, CustomerWidgetDTO } from '../../shared/types'
import { CUSTOMER_VISITOR_USER_ID, normalizeWidgetSite, WIDGET_LIMITS, widgetEmbedCode } from '../../shared/customer-widgets'
import { newId, nowIso } from '../../shared/ids'
import { hasPermission, Permission } from '../../shared/permissions'
import { spaceSql } from '../../shared/spaces'
import type { ZugoidEnv } from '../../workers/env'
import { identityContactTouchStatement, touchConversationStatement } from '../../workers/customer-records'
import type { ServerMembership } from './channel-access'
import { fail } from './cf'
import { readableSources, writableSources } from './customers'
import { auditStatement } from './messages'

/**
 * Widgets as the team sees them. A Widget is a private channel in Customers and a Source;
 * its channel members are the team that answers it. The Owner or someone with Manage
 * server creates it, changes it and chooses who answers.
 */

/** Random, URL-safe: the Widget's public ID and a Visitor's token. */
export function randomToken(bytes: number): string {
  let binary = ''
  for (const byte of crypto.getRandomValues(new Uint8Array(bytes))) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

export function canManageWidgets(member: ServerMembership): boolean {
  return member.isOwner || hasPermission(member.perms, Permission.manageServer)
}

/** Sites as stored: each a valid origin or subdomain wildcard, once. */
export function widgetSites(values: string[]): string[] {
  const sites = [...new Set(values.map((value) => {
    const site = normalizeWidgetSite(value)
    if (!site) fail(400, 'bad_request', `${value} is not a site. Use an address like https://example.com or https://*.example.com`)
    return site
  }))]
  if (sites.length > WIDGET_LIMITS.sites) fail(400, 'bad_request', `A Widget can have at most ${WIDGET_LIMITS.sites} sites`)
  return sites
}

function parseSites(json: string): string[] {
  try {
    const value = JSON.parse(json) as unknown
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  }
  catch { return [] }
}

type WidgetRow = {
  channelId: string; spaceId: string; publicId: string; name: string; sitesJson: string; greeting: string; enabled: number
  openCount: number; member: number
}

function quoted(id: string) {
  return `'${id.replace(/'/gu, "''")}'`
}

const widgetColumns = (member: ServerMembership) => `w.channel_id AS channelId, sc.space_id AS spaceId, w.public_id AS publicId, w.name,
  w.sites_json AS sitesJson, w.greeting, w.enabled,
  (SELECT count(*) FROM customer_conversations cv WHERE cv.source_channel_id = w.channel_id AND cv.status IN ('open', 'waiting')) AS openCount,
  EXISTS (SELECT 1 FROM channel_members cm WHERE cm.channel_id = w.channel_id AND cm.user_id = ${quoted(member.user.id)}) AS member`

function widgetDto(row: WidgetRow, member: ServerMembership, serverOrigin: string): CustomerWidgetDTO {
  const answers = Boolean(row.member)
  return {
    channelId: row.channelId, spaceId: row.spaceId, publicId: row.publicId, name: row.name, sites: parseSites(row.sitesJson),
    greeting: row.greeting, enabled: Boolean(row.enabled), embedCode: widgetEmbedCode(serverOrigin, row.publicId),
    // Someone who does not answer the Widget does not learn how busy it is.
    openCount: answers ? Number(row.openCount) : 0, member: answers, canManage: canManageWidgets(member),
  }
}

/** Widgets the member answers or manages, in the Spaces they reach. */
export async function listCustomerWidgets(env: ZugoidEnv, member: ServerMembership, serverOrigin: string): Promise<CustomerWidgetDTO[]> {
  const rows = await env.DB.prepare(
    `SELECT ${widgetColumns(member)} FROM customer_widgets w JOIN channels sc ON sc.id = w.channel_id
     WHERE sc.space_id IN (${spaceSql(member.authorization)}) ORDER BY lower(w.name), w.channel_id`,
  ).all<WidgetRow>()
  return (rows.results ?? []).filter(row => row.member || canManageWidgets(member)).map(row => widgetDto(row, member, serverOrigin))
}

async function findWidget(env: ZugoidEnv, member: ServerMembership, channelId: string): Promise<WidgetRow> {
  const row = await env.DB.prepare(
    `SELECT ${widgetColumns(member)} FROM customer_widgets w JOIN channels sc ON sc.id = w.channel_id
     WHERE w.channel_id = ? AND sc.space_id IN (${spaceSql(member.authorization)})`,
  ).bind(channelId).first<WidgetRow>()
  if (!row || (!row.member && !canManageWidgets(member))) fail(404, 'not_found', 'Widget not found')
  return row
}

async function findManagedWidget(env: ZugoidEnv, member: ServerMembership, channelId: string): Promise<WidgetRow> {
  const row = await findWidget(env, member, channelId)
  if (!canManageWidgets(member)) fail(403, 'forbidden', 'Managing a Widget takes Manage server')
  return row
}

/** A Widget and who answers it. */
export async function readCustomerWidget(env: ZugoidEnv, member: ServerMembership, channelId: string, serverOrigin: string): Promise<{ widget: CustomerWidgetDTO; memberIds: string[] }> {
  const row = await findWidget(env, member, channelId)
  const members = await env.DB.prepare(
    "SELECT cm.user_id AS id FROM channel_members cm JOIN users u ON u.id = cm.user_id WHERE cm.channel_id = ? AND u.status = 'active' ORDER BY cm.joined_at",
  ).bind(channelId).all<{ id: string }>()
  return { widget: widgetDto(row, member, serverOrigin), memberIds: (members.results ?? []).map(item => item.id) }
}

/** The author of Visitors' messages exists once a Server has a Widget. */
function visitorAuthorStatement(env: ZugoidEnv, at: string) {
  return env.DB.prepare(
    `INSERT INTO users (id, kind, handle, display_name, avatar_r2_key, status, role_id, nickname, joined_at, created_at, updated_at)
     VALUES (?, 'human', NULL, 'Visitor', NULL, 'removed', NULL, NULL, NULL, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  ).bind(CUSTOMER_VISITOR_USER_ID, at, at)
}

/** Active Members of the Space, out of the given IDs. */
async function spaceMemberIds(env: ZugoidEnv, spaceId: string, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set()
  const rows = await env.DB.prepare(
    `SELECT u.id FROM users u JOIN space_members m ON m.user_id = u.id
     WHERE m.space_id = ? AND u.status = 'active' AND u.id IN (${ids.map(() => '?').join(',')})`,
  ).bind(spaceId, ...ids).all<{ id: string }>()
  return new Set((rows.results ?? []).map(row => row.id))
}

export async function createCustomerWidget(env: ZugoidEnv, member: ServerMembership, input: { spaceId: string; name: string; sites: string[]; greeting?: string }) {
  if (!canManageWidgets(member)) fail(403, 'forbidden', 'Creating a Widget takes Manage server')
  const sites = widgetSites(input.sites)
  const channelId = newId()
  const at = nowIso()
  // The creator and the Owner answer it until someone changes that in its settings.
  const answering = await spaceMemberIds(env, input.spaceId, [...new Set([member.user.id, member.ownerId])])
  await env.DB.batch([
    visitorAuthorStatement(env, at),
    env.DB.prepare(
      `INSERT INTO channels (id, space_id, name, topic, type, section, visibility, category_id, position, created_by, live_meeting_id, parent_id, parent_message_id, created_at, updated_at)
       VALUES (?, ?, ?, '', 'text', 'customers', 'private', NULL, 0, ?, NULL, NULL, NULL, ?, ?)`,
    ).bind(channelId, input.spaceId, input.name, member.user.id, at, at),
    env.DB.prepare(
      `INSERT INTO customer_widgets (channel_id, public_id, name, sites_json, greeting, enabled, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    ).bind(channelId, randomToken(18), input.name, JSON.stringify(sites), input.greeting ?? '', member.user.id, at, at),
    ...[...answering].map(userId => env.DB.prepare('INSERT INTO channel_members (channel_id, user_id, hidden_at, joined_at) VALUES (?, ?, NULL, ?)').bind(channelId, userId, at)),
    await auditStatement(env, { serverId: member.serverId, actorId: member.user.id, action: 'customer_widget.create', targetType: 'customer_widget',
      targetId: channelId, meta: { name: input.name, sites }, authorization: member.authorization }),
  ])
  return { channelId }
}

export async function updateCustomerWidget(env: ZugoidEnv, member: ServerMembership, channelId: string, input: { name?: string; sites?: string[]; greeting?: string; enabled?: boolean }) {
  await findManagedWidget(env, member, channelId)
  const sites = input.sites ? widgetSites(input.sites) : null
  const at = nowIso()
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE customer_widgets SET name = coalesce(?, name), sites_json = coalesce(?, sites_json), greeting = coalesce(?, greeting),
         enabled = coalesce(?, enabled), updated_at = ? WHERE channel_id = ?`,
    ).bind(input.name ?? null, sites ? JSON.stringify(sites) : null, input.greeting ?? null, input.enabled === undefined ? null : input.enabled ? 1 : 0, at, channelId),
    env.DB.prepare('UPDATE channels SET name = coalesce(?, name), updated_at = ? WHERE id = ?').bind(input.name ?? null, at, channelId),
    await auditStatement(env, { serverId: member.serverId, actorId: member.user.id, action: 'customer_widget.update', targetType: 'customer_widget',
      targetId: channelId, meta: { ...input, ...sites ? { sites } : {} }, authorization: member.authorization }),
  ])
}

/** Removes the Widget and its Conversations. Its Contacts stay. */
export async function deleteCustomerWidget(env: ZugoidEnv, member: ServerMembership, channelId: string) {
  await findManagedWidget(env, member, channelId)
  await env.DB.batch([
    await auditStatement(env, { serverId: member.serverId, actorId: member.user.id, action: 'customer_widget.delete', targetType: 'customer_widget',
      targetId: channelId, authorization: member.authorization }),
    env.DB.prepare('DELETE FROM channels WHERE id = ?').bind(channelId),
  ])
}

/** Who answers the Widget: Members of its Space. The Owner always does. */
export async function setCustomerWidgetMembers(env: ZugoidEnv, member: ServerMembership, channelId: string, userIds: string[]) {
  const row = await findManagedWidget(env, member, channelId)
  const answering = await spaceMemberIds(env, row.spaceId, [...new Set([...userIds, member.ownerId])])
  const at = nowIso()
  const ids = [...answering]
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM channel_members WHERE channel_id = ? AND user_id NOT IN (${ids.map(() => '?').join(',') || "''"})`).bind(channelId, ...ids),
    ...ids.map(userId => env.DB.prepare('INSERT OR IGNORE INTO channel_members (channel_id, user_id, hidden_at, joined_at) VALUES (?, ?, NULL, ?)').bind(channelId, userId, at)),
    await auditStatement(env, { serverId: member.serverId, actorId: member.user.id, action: 'customer_widget.members', targetType: 'customer_widget',
      targetId: channelId, meta: { members: ids }, authorization: member.authorization }),
  ])
}

type ConversationRow = Omit<CustomerWidgetConversationDTO, 'contactName'> & { contactName: string | null }

const conversationColumns = `cv.channel_id AS channelId, cv.source_channel_id AS sourceChannelId, cv.contact_id AS contactId,
  ct.name AS contactName, cv.status, cv.assignee_id AS assigneeId, cv.last_message_at AS lastMessageAt,
  coalesce((SELECT substr(m.content, 1, 200) FROM messages m WHERE m.channel_id = cv.channel_id AND m.deleted_at IS NULL ORDER BY m.id DESC LIMIT 1), '') AS preview`

function conversationDto(row: ConversationRow): CustomerWidgetConversationDTO {
  return { ...row, contactName: row.contactName ?? 'Unknown' }
}

export const CONVERSATION_STATUSES: readonly CustomerConversationStatus[] = ['open', 'waiting', 'resolved', 'spam', 'trash']

/** One Widget's Conversations with a status, newest first; only for the team that answers it. */
export async function listWidgetConversations(env: ZugoidEnv, member: ServerMembership, widgetId: string, status: CustomerConversationStatus, before?: string | null): Promise<CustomerWidgetConversationDTO[]> {
  const rows = await env.DB.prepare(
    `SELECT ${conversationColumns} FROM customer_conversations cv LEFT JOIN customer_contacts ct ON ct.id = cv.contact_id
     WHERE cv.source_channel_id = ?1 AND cv.source_channel_id IN (${readableSources(member)}) AND cv.status = ?2
       AND (?3 IS NULL OR cv.last_message_at < ?3)
     ORDER BY cv.last_message_at DESC, cv.channel_id DESC LIMIT 100`,
  ).bind(widgetId, status, before ?? null).all<ConversationRow>()
  if (!rows.results?.length && !await env.DB.prepare(`SELECT 1 AS ok WHERE ? IN (${readableSources(member)})`).bind(widgetId).first()) {
    fail(404, 'not_found', 'Widget not found')
  }
  return (rows.results ?? []).map(conversationDto)
}

/** A Conversation the member can read, with whether they can answer it. 404 when they cannot see it. */
async function findConversation(env: ZugoidEnv, member: ServerMembership, channelId: string) {
  const row = await env.DB.prepare(
    `SELECT ${conversationColumns}, s.kind AS sourceKind, sc.name AS sourceName, sc.space_id AS spaceId, cv.identity_id AS identityId,
       cv.source_channel_id IN (${writableSources(member)}) AS writable
     FROM customer_conversations cv
     JOIN customer_sources s ON s.channel_id = cv.source_channel_id
     JOIN channels sc ON sc.id = cv.source_channel_id
     LEFT JOIN customer_contacts ct ON ct.id = cv.contact_id
     WHERE cv.channel_id = ? AND cv.source_channel_id IN (${readableSources(member)})`,
  ).bind(channelId).first<ConversationRow & { sourceKind: 'mailbox' | 'widget'; sourceName: string; spaceId: string; identityId: string | null; writable: number }>()
  if (!row) fail(404, 'not_found', 'Conversation not found')
  return row
}

type MessageRow = { id: string; content: string; createdAt: string; authorId: string; authorKind: 'human' | 'agent'; authorName: string; authorAvatar: string | null; direction: 'inbound' | 'outbound' | null }

function messageDto(row: MessageRow, contactName: string): CustomerMessageDTO {
  const visitor = row.authorId === CUSTOMER_VISITOR_USER_ID
  return {
    id: row.id, content: row.content, createdAt: row.createdAt, direction: row.direction,
    author: { id: row.authorId, kind: row.authorKind, displayName: visitor ? contactName : row.authorName, avatarR2Key: visitor ? null : row.authorAvatar },
  }
}

async function loadMessages(env: ZugoidEnv, conversationId: string, contactName: string, messageId?: string): Promise<CustomerMessageDTO[]> {
  const rows = await env.DB.prepare(
    `SELECT m.id, m.content, m.created_at AS createdAt, m.author_id AS authorId, u.kind AS authorKind,
       coalesce(nullif(u.nickname, ''), u.display_name) AS authorName, u.avatar_r2_key AS authorAvatar, wm.direction
     FROM messages m JOIN users u ON u.id = m.author_id
     LEFT JOIN customer_widget_messages wm ON wm.message_id = m.id
     WHERE m.channel_id = ?1 AND m.deleted_at IS NULL AND (?2 IS NULL OR m.id = ?2)
     ORDER BY m.id DESC LIMIT 500`,
  ).bind(conversationId, messageId ?? null).all<MessageRow>()
  return (rows.results ?? []).reverse().map(row => messageDto(row, contactName))
}

/** A Widget Conversation for the team: every message, notes included, and who the Visitor says they are. */
export async function readCustomerConversation(env: ZugoidEnv, member: ServerMembership, channelId: string): Promise<CustomerConversationDetailDTO> {
  const row = await findConversation(env, member, channelId)
  if (row.sourceKind !== 'widget') fail(404, 'not_found', 'Open email conversations in their Mailbox')
  const { sourceKind, sourceName, spaceId, identityId, writable, ...conversation } = row
  const [visitor, messages] = await Promise.all([
    identityId
      ? env.DB.prepare(`SELECT claimed_name AS claimedName, claimed_email AS claimedEmail, country, user_agent AS userAgent, last_seen_at AS lastSeenAt
          FROM customer_visitors WHERE identity_id = ? LIMIT 1`).bind(identityId).first<NonNullable<CustomerConversationDetailDTO['visitor']>>()
      : null,
    loadMessages(env, channelId, conversation.contactName ?? 'Visitor'),
  ])
  return { conversation: { ...conversationDto(conversation), sourceKind, sourceName, spaceId }, visitor: visitor ?? null, messages, canReply: Boolean(writable) }
}

/** Status and assignee, for a Conversation from any Source the member answers. */
export async function updateCustomerConversation(env: ZugoidEnv, member: ServerMembership, channelId: string, input: { status?: CustomerConversationStatus; assigneeId?: string | null }) {
  const row = await findConversation(env, member, channelId)
  if (!row.writable) fail(403, 'forbidden', 'This Conversation is read only for you')
  if (input.assigneeId && !(await spaceMemberIds(env, row.spaceId, [input.assigneeId])).size) fail(400, 'bad_request', 'The assignee must be a Member of this Space')
  await env.DB.prepare(
    `UPDATE customer_conversations SET status = coalesce(?, status), assignee_id = CASE WHEN ? = 1 THEN ? ELSE assignee_id END, updated_at = ? WHERE channel_id = ?`,
  ).bind(input.status ?? null, input.assigneeId === undefined ? 0 : 1, input.assigneeId ?? null, nowIso(), channelId).run()
}

/**
 * A team message in a Widget Conversation. A reply gets an outbound delivery row and so
 * reaches the Visitor; a note has none and stays inside.
 */
export async function postCustomerConversationMessage(env: ZugoidEnv, member: ServerMembership, channelId: string, input: { content: string; kind: 'reply' | 'note' }): Promise<CustomerMessageDTO> {
  const row = await findConversation(env, member, channelId)
  if (row.sourceKind !== 'widget') fail(404, 'not_found', 'Answer email conversations from their Mailbox')
  if (!row.writable) fail(403, 'forbidden', 'This Conversation is read only for you')
  const messageId = newId()
  const at = nowIso()
  const reply = input.kind === 'reply'
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO messages (id, channel_id, author_id, content, reply_to_id, edited_at, deleted_at, created_at)
       VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?)`,
    ).bind(messageId, channelId, member.user.id, input.content, at),
    touchConversationStatement(env, { channelId, at, inbound: false }),
    ...reply
      ? [
          env.DB.prepare("INSERT INTO customer_widget_messages (message_id, conversation_channel_id, direction, created_at) VALUES (?, ?, 'outbound', ?)").bind(messageId, channelId, at),
          ...row.identityId ? [identityContactTouchStatement(env, { identityId: row.identityId, at, inbound: false })] : [],
        ]
      : [],
  ])
  const [message] = await loadMessages(env, channelId, row.contactName ?? 'Visitor', messageId)
  if (!message) fail(404, 'not_found', 'Message not found')
  return message
}
