import type { MailThreadStatus } from '../shared/types'
import { newId } from '../shared/ids'
import type { ZugoidEnv } from './env'

/**
 * The Customers engine's shared writes: Contacts and Identities from the people who
 * write or are written to, and the Customer Conversation row beside each
 * `conversation` channel. Each function returns statements for the caller's batch,
 * so a message and its Customers rows are stored together or not at all.
 */

/** Mail's folders over a Conversation's status: Inbox is open or waiting, Archive is resolved. */
export function mailStatusSql(conversation: string): string {
  return `CASE ${conversation}.status WHEN 'resolved' THEN 'archive' WHEN 'spam' THEN 'spam' WHEN 'trash' THEN 'trash' ELSE 'inbox' END`
}

/** SQL for Conversations a mail folder holds by status. */
export function mailStatusFilterSql(conversation: string, status: MailThreadStatus): string {
  if (status === 'inbox') return `${conversation}.status IN ('open', 'waiting')`
  return `${conversation}.status = '${conversationStatusForMail(status)}'`
}

export function conversationStatusForMail(status: MailThreadStatus): 'open' | 'resolved' | 'spam' | 'trash' {
  return status === 'inbox' ? 'open' : status === 'archive' ? 'resolved' : status
}

/** The Space of a Source, for statements that run before any of its rows are read. */
const sourceSpace = '(SELECT space_id FROM channels WHERE id = ?)'

type EmailPerson = {
  /** The Source the email came through or left from; its Space owns the Contact. */
  sourceChannelId: string
  address: string
  name?: string | null
  at: string
  /** Inbound mail that passed sender authentication. */
  verified?: boolean
  direction: 'inbound' | 'outbound'
}

/**
 * Makes sure an email address has an Identity and a Contact in the Source's Space,
 * and records that it wrote or was written to. A new address gets a new Contact,
 * named from what it gave; a known one keeps its Contact. Joining two Contacts is
 * left to a Member or an Agent.
 */
export function emailPersonStatements(env: ZugoidEnv, person: EmailPerson): D1PreparedStatement[] {
  const address = person.address.trim().toLowerCase()
  const name = person.name?.trim() || null
  const contactId = newId()
  const inbound = person.direction === 'inbound'
  return [
    env.DB.prepare(
      `INSERT INTO customer_contacts (id, space_id, name, first_seen_at, last_seen_at, last_contacted_at, created_at, updated_at)
       SELECT ?, ${sourceSpace}, ?, ?, ?, ?, ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM customer_identities WHERE space_id = ${sourceSpace} AND kind = 'email' AND value = ?)`,
    ).bind(contactId, person.sourceChannelId, name || address, person.at, inbound ? person.at : null, inbound ? null : person.at,
      person.at, person.at, person.sourceChannelId, address),
    env.DB.prepare(
      `INSERT INTO customer_identities (id, space_id, kind, value, display_name, contact_id, verified_at, verified_by, created_at, updated_at)
       SELECT ?, ${sourceSpace}, 'email', ?, ?, ?, ?, ?, ?, ? WHERE true
       ON CONFLICT(space_id, kind, value) DO UPDATE SET
         display_name = coalesce(excluded.display_name, customer_identities.display_name),
         verified_at = coalesce(customer_identities.verified_at, excluded.verified_at),
         verified_by = coalesce(customer_identities.verified_by, excluded.verified_by),
         updated_at = excluded.updated_at`,
    ).bind(newId(), person.sourceChannelId, address, inbound ? name : null, contactId,
      person.verified ? person.at : null, person.verified ? 'sender_auth' : null, person.at, person.at),
    env.DB.prepare(
      `UPDATE customer_contacts SET
         last_seen_at = CASE WHEN ?1 = 1 THEN max(coalesce(last_seen_at, ''), ?2) ELSE last_seen_at END,
         last_contacted_at = CASE WHEN ?1 = 0 THEN max(coalesce(last_contacted_at, ''), ?2) ELSE last_contacted_at END,
         -- A Contact first met by writing to it is named by its address until it gives a name.
         name = CASE WHEN ?5 IS NOT NULL AND name = ?4 THEN ?5 ELSE name END,
         updated_at = ?2
       WHERE id = (SELECT contact_id FROM customer_identities WHERE space_id = ${sourceSpace.replace('?', '?3')} AND kind = 'email' AND value = ?4)`,
    ).bind(inbound ? 1 : 0, person.at, person.sourceChannelId, address, inbound ? name : null),
    // A verified address on a Company's domain puts its Contact in that Company.
    env.DB.prepare(
      `INSERT OR IGNORE INTO customer_contact_companies (contact_id, company_id, linked_by, created_at, updated_at)
       SELECT i.contact_id, d.company_id, 'domain', ?1, ?1 FROM customer_identities i
       JOIN customer_company_domains d ON d.space_id = i.space_id AND d.domain = substr(i.value, instr(i.value, '@') + 1)
       WHERE i.space_id = ${sourceSpace.replace('?', '?2')} AND i.kind = 'email' AND i.value = ?3 AND i.verified_at IS NOT NULL`,
    ).bind(person.at, person.sourceChannelId, address),
  ]
}

/** The Contact behind an email address in a Source's Space, as a subquery for a following statement. */
function emailContactSql(): string {
  return `(SELECT contact_id FROM customer_identities WHERE space_id = ${sourceSpace} AND kind = 'email' AND value = ?)`
}

type BrowserPerson = {
  /** The Widget the Visitor writes through; its Space owns the Contact. */
  sourceChannelId: string
  visitorId: string
  identityId: string
  /** A typed name, or nothing: the Contact is then "Visitor" with a number. */
  name?: string | null
  at: string
}

/**
 * A new Visitor's `browser` Identity and its own new Contact. A browser never joins an
 * existing Contact by itself: only a Member or an Agent joins it, and the Visitor never
 * learns that they did.
 */
export function browserPersonStatements(env: ZugoidEnv, person: BrowserPerson): D1PreparedStatement[] {
  const contactId = newId()
  const name = person.name?.trim() || null
  return [
    env.DB.prepare(
      `INSERT INTO customer_contacts (id, space_id, name, first_seen_at, last_seen_at, last_contacted_at, created_at, updated_at)
       VALUES (?1, ${sourceSpace.replace('?', '?2')},
         coalesce(?3, 'Visitor ' || (1 + (SELECT count(*) FROM customer_identities WHERE space_id = ${sourceSpace.replace('?', '?2')} AND kind = 'browser'))),
         ?4, NULL, NULL, ?4, ?4)`,
    ).bind(contactId, person.sourceChannelId, name, person.at),
    env.DB.prepare(
      `INSERT INTO customer_identities (id, space_id, kind, value, display_name, contact_id, verified_at, verified_by, created_at, updated_at)
       VALUES (?, ${sourceSpace}, 'browser', ?, ?, ?, NULL, NULL, ?, ?)`,
    ).bind(person.identityId, person.sourceChannelId, person.visitorId, name, contactId, person.at, person.at),
  ]
}

/**
 * A Visitor gave a name. Their Identity shows it, and their Contact takes it while it is
 * still only theirs and still numbered: a Contact the team named or joined keeps its name.
 */
export function browserNameStatement(env: ZugoidEnv, input: { identityId: string; name: string; at: string }) {
  return env.DB.prepare(
    `UPDATE customer_contacts SET name = ?2, updated_at = ?3
     WHERE id = (SELECT contact_id FROM customer_identities WHERE id = ?1) AND name GLOB 'Visitor [0-9]*'
       AND (SELECT count(*) FROM customer_identities WHERE contact_id = customer_contacts.id) = 1`,
  ).bind(input.identityId, input.name, input.at)
}

/** Someone outside wrote from this Identity, or the team wrote to it. */
export function identityContactTouchStatement(env: ZugoidEnv, input: { identityId: string; at: string; inbound: boolean }) {
  return env.DB.prepare(
    `UPDATE customer_contacts SET
       last_seen_at = CASE WHEN ?3 = 1 THEN max(coalesce(last_seen_at, ''), ?2) ELSE last_seen_at END,
       last_contacted_at = CASE WHEN ?3 = 0 THEN max(coalesce(last_contacted_at, ''), ?2) ELSE last_contacted_at END,
       updated_at = ?2
     WHERE id = (SELECT contact_id FROM customer_identities WHERE id = ?1)`,
  ).bind(input.identityId, input.at, input.inbound ? 1 : 0)
}

/**
 * A Customer Conversation for a new `conversation` channel: on the Contact of an email
 * `address`, or with the Identity a Source proved (a Visitor's browser) and its Contact.
 */
export function insertConversationStatement(env: ZugoidEnv, input: { channelId: string; sourceChannelId: string; address?: string | null; identityId?: string | null; at: string }) {
  if (input.identityId) {
    return env.DB.prepare(
      `INSERT INTO customer_conversations (channel_id, source_channel_id, contact_id, identity_id, status, last_message_at, created_at, updated_at)
       VALUES (?1, ?2, (SELECT contact_id FROM customer_identities WHERE id = ?3), ?3, 'open', ?4, ?4, ?4)`,
    ).bind(input.channelId, input.sourceChannelId, input.identityId, input.at)
  }
  return env.DB.prepare(
    `INSERT INTO customer_conversations (channel_id, source_channel_id, contact_id, status, last_message_at, created_at, updated_at)
     VALUES (?, ?, ${input.address ? emailContactSql() : 'NULL'}, 'open', ?, ?, ?)`,
  ).bind(input.channelId, input.sourceChannelId, ...(input.address ? [input.sourceChannelId, input.address.trim().toLowerCase()] : []), input.at, input.at, input.at)
}

/**
 * A new message in a Conversation. From outside it reopens the Conversation unless
 * it was filed as Spam or Trash; from the team it only moves the time.
 */
export function touchConversationStatement(env: ZugoidEnv, input: { channelId: string; at: string; inbound: boolean }) {
  return env.DB.prepare(
    `UPDATE customer_conversations SET
       status = CASE WHEN ?1 = 1 AND status NOT IN ('spam', 'trash') THEN 'open' ELSE status END,
       last_message_at = max(last_message_at, ?2), updated_at = ?2
     WHERE channel_id = ?3`,
  ).bind(input.inbound ? 1 : 0, input.at, input.channelId)
}
