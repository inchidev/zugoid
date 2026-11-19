import type { CustomerCompanyDTO, CustomerContactCompanyDTO, CustomerContactDTO, CustomerConversationDTO } from '../../shared/types'
import { FREE_MAIL_DOMAINS, normalizeCompanyDomain } from '../../shared/customers'
import { newId, nowIso } from '../../shared/ids'
import { hasPermission, Permission } from '../../shared/permissions'
import { spaceSql } from '../../shared/spaces'
import type { ZugoidEnv } from '../../workers/env'
import type { ServerMembership } from './channel-access'
import { fail } from './cf'
import { auditStatement } from './messages'

/**
 * Who sees what in Customers, until Customers has permissions of its own: a Member
 * sees the Contacts and Companies of a Space where they can read a Source, and the
 * Conversations of those Sources only. A Mailbox is read through its grant and the
 * email policy; a Widget by being one of its channel members, the team that answers it.
 * Changing Contacts and Companies takes a Source they can answer from.
 */
function quoted(id: string) {
  return `'${id.replace(/'/gu, "''")}'`
}

function readableMailboxes(member: ServerMembership): string {
  if (!member.isOwner && !hasPermission(member.perms, Permission.readMail)) return 'SELECT NULL WHERE 0'
  return `SELECT mb.channel_id FROM email_mailboxes mb
    JOIN grants g ON g.mailbox_id = mb.channel_id AND g.member_id = ${quoted(member.user.id)}
    JOIN channels sc ON sc.id = mb.channel_id
    WHERE mb.enabled = 1 AND sc.space_id IN (${spaceSql(member.authorization)})`
}

/**
 * Widgets and Telegram bots the member answers: they are one of its channel members, in a
 * Space they reach. A Mailbox is answered by its grants instead.
 */
export function answeredWidgets(member: ServerMembership): string {
  return `SELECT s.channel_id FROM customer_sources s
    JOIN channel_members cm ON cm.channel_id = s.channel_id AND cm.user_id = ${quoted(member.user.id)}
    JOIN channels sc ON sc.id = s.channel_id
    WHERE s.kind IN ('widget', 'telegram') AND sc.space_id IN (${spaceSql(member.authorization)})`
}

export function readableSources(member: ServerMembership): string {
  return `${readableMailboxes(member)} UNION ${answeredWidgets(member)}`
}

export function writableSources(member: ServerMembership): string {
  const mailboxes = member.isOwner || (hasPermission(member.perms, Permission.readMail) && hasPermission(member.perms, Permission.sendMail))
    ? `${readableMailboxes(member)} AND (g.permissions & ${Permission.sendMail}) <> 0`
    : 'SELECT NULL WHERE 0'
  return `${mailboxes} UNION ${answeredWidgets(member)}`
}

function readableSpaces(member: ServerMembership): string {
  return `SELECT space_id FROM channels WHERE id IN (${readableSources(member)})`
}

/** Customers exists for a member who may read email or who answers a Widget or a Telegram bot. */
export async function requireCustomersReader(env: ZugoidEnv, member: ServerMembership) {
  if (member.isOwner || hasPermission(member.perms, Permission.readMail)) return
  if (!await env.DB.prepare(`SELECT 1 AS ok FROM (${answeredWidgets(member)}) LIMIT 1`).first()) fail(404, 'not_found', 'Customers not found')
}

/** The Space of a Contact or Company the member can change; 404 when they cannot see it, 403 when they can only read. */
async function requireWritableSpace(env: ZugoidEnv, member: ServerMembership, table: 'customer_contacts' | 'customer_companies', id: string): Promise<string> {
  await requireCustomersReader(env, member)
  const row = await env.DB.prepare(
    `SELECT r.space_id AS spaceId, r.space_id IN (SELECT space_id FROM channels WHERE id IN (${writableSources(member)})) AS writable
     FROM ${table} r WHERE r.id = ? AND r.space_id IN (${readableSpaces(member)})`,
  ).bind(id).first<{ spaceId: string; writable: number }>()
  if (!row) fail(404, 'not_found', table === 'customer_contacts' ? 'Contact not found' : 'Company not found')
  if (!row.writable) fail(403, 'forbidden', 'Changing Customers takes a Mailbox you can send from or a Widget you answer')
  return row.spaceId
}

type ContactRow = Omit<CustomerContactDTO, 'emails' | 'companies'> & { emailsJson: string; companiesJson: string }

const contactColumns = (member: ServerMembership) => `ct.id, ct.space_id AS spaceId, ct.name, ct.owner_id AS ownerId, ct.first_seen_at AS firstSeenAt,
  ct.last_seen_at AS lastSeenAt, ct.last_contacted_at AS lastContactedAt,
  (SELECT json_group_array(json_object('address', i.value, 'verified', i.verified_at IS NOT NULL))
    FROM (SELECT value, verified_at FROM customer_identities WHERE contact_id = ct.id AND kind = 'email'
      ORDER BY verified_at IS NULL, value LIMIT 20) i) AS emailsJson,
  (SELECT json_group_array(json_object('id', co.id, 'name', co.name, 'title', l.title, 'current', l.current, 'linkedBy', l.linked_by))
    FROM customer_contact_companies l JOIN customer_companies co ON co.id = l.company_id
    WHERE l.contact_id = ct.id) AS companiesJson,
  (SELECT count(*) FROM customer_conversations cv WHERE cv.contact_id = ct.id
    AND cv.source_channel_id IN (${readableSources(member)})) AS conversationCount`

function parseJson<T>(value: string | null | undefined): T[] {
  try { return value ? JSON.parse(value) as T[] : [] }
  catch { return [] }
}

function contactDto(row: ContactRow): CustomerContactDTO {
  const { emailsJson, companiesJson, ...contact } = row
  return {
    ...contact,
    emails: parseJson<{ address: string; verified: number | boolean }>(emailsJson).map(item => ({ address: item.address, verified: Boolean(item.verified) })),
    companies: parseJson<CustomerContactCompanyDTO & { current: number | boolean }>(companiesJson)
      .map(item => ({ ...item, current: Boolean(item.current) }))
      .sort((a, b) => Number(b.current) - Number(a.current) || a.name.localeCompare(b.name)),
    conversationCount: Number(contact.conversationCount),
  }
}

export const CUSTOMER_PAGE = 100

/** Contacts the member can see, most recently in touch first, optionally matching a name or address. */
export async function listCustomerContacts(env: ZugoidEnv, member: ServerMembership, input: { search?: string | null; companyId?: string | null } = {}): Promise<CustomerContactDTO[]> {
  await requireCustomersReader(env, member)
  const term = input.search?.trim().toLowerCase().slice(0, 200) || null
  const rows = await env.DB.prepare(
    `SELECT ${contactColumns(member)} FROM customer_contacts ct
     WHERE ct.space_id IN (${readableSpaces(member)})
       AND (?1 IS NULL OR instr(lower(ct.name), ?1) > 0
         OR EXISTS (SELECT 1 FROM customer_identities i WHERE i.contact_id = ct.id AND instr(i.value, ?1) > 0))
       AND (?2 IS NULL OR EXISTS (SELECT 1 FROM customer_contact_companies l WHERE l.contact_id = ct.id AND l.company_id = ?2))
     ORDER BY max(coalesce(ct.last_seen_at, ''), coalesce(ct.last_contacted_at, ''), ct.first_seen_at) DESC, ct.id DESC
     LIMIT ${CUSTOMER_PAGE}`,
  ).bind(term, input.companyId ?? null).all<ContactRow>()
  return (rows.results ?? []).map(contactDto)
}

/** One Contact and its Conversations in Sources the member can read. */
export async function readCustomerContact(env: ZugoidEnv, member: ServerMembership, contactId: string): Promise<{ contact: CustomerContactDTO; conversations: CustomerConversationDTO[] }> {
  await requireCustomersReader(env, member)
  const [contact, conversations] = await Promise.all([
    env.DB.prepare(`SELECT ${contactColumns(member)} FROM customer_contacts ct WHERE ct.id = ? AND ct.space_id IN (${readableSpaces(member)})`)
      .bind(contactId).first<ContactRow>(),
    env.DB.prepare(
      `SELECT cv.channel_id AS channelId, cv.source_channel_id AS sourceChannelId, s.kind AS sourceKind,
         coalesce(mb.display_name, sc.name) AS sourceName, coalesce(t.subject, c.name) AS subject, cv.status,
         cv.last_message_at AS lastMessageAt
       FROM customer_conversations cv
       JOIN customer_sources s ON s.channel_id = cv.source_channel_id
       JOIN channels sc ON sc.id = cv.source_channel_id
       JOIN channels c ON c.id = cv.channel_id
       LEFT JOIN email_mailboxes mb ON mb.channel_id = cv.source_channel_id
       LEFT JOIN email_threads t ON t.channel_id = cv.channel_id
       WHERE cv.contact_id = ? AND cv.source_channel_id IN (${readableSources(member)})
       ORDER BY cv.last_message_at DESC, cv.channel_id DESC LIMIT 200`,
    ).bind(contactId).all<CustomerConversationDTO>(),
  ])
  if (!contact) fail(404, 'not_found', 'Contact not found')
  return { contact: contactDto(contact), conversations: conversations.results ?? [] }
}

/** Renames a Contact or gives it an owner, a Member of its Space. */
export async function updateCustomerContact(env: ZugoidEnv, member: ServerMembership, contactId: string, input: { name?: string; ownerId?: string | null }) {
  const spaceId = await requireWritableSpace(env, member, 'customer_contacts', contactId)
  if (input.ownerId && !await env.DB.prepare("SELECT 1 AS ok FROM space_members m JOIN users u ON u.id = m.user_id WHERE m.space_id = ? AND m.user_id = ? AND u.status = 'active'")
    .bind(spaceId, input.ownerId).first()) fail(400, 'bad_request', 'The owner must be a Member of this Space')
  const at = nowIso()
  await env.DB.batch([
    env.DB.prepare(`UPDATE customer_contacts SET name = coalesce(?, name), owner_id = CASE WHEN ? = 1 THEN ? ELSE owner_id END, updated_at = ? WHERE id = ?`)
      .bind(input.name ?? null, input.ownerId === undefined ? 0 : 1, input.ownerId ?? null, at, contactId),
    await auditStatement(env, { serverId: member.serverId, actorId: member.user.id, action: 'customer_contact.update', targetType: 'customer_contact',
      targetId: contactId, meta: { ...input }, authorization: member.authorization }),
  ])
}

/**
 * Joins one Contact into another in the same Space: its Identities, Conversations and
 * Companies move, and it is removed. The audit row lists what moved, so the join can
 * be told apart later. Joining is for the team; nothing about it reaches the outside.
 */
export async function mergeCustomerContacts(env: ZugoidEnv, member: ServerMembership, fromId: string, intoId: string) {
  if (fromId === intoId) fail(400, 'bad_request', 'A Contact cannot be joined into itself')
  const [fromSpace, intoSpace] = await Promise.all([
    requireWritableSpace(env, member, 'customer_contacts', fromId),
    requireWritableSpace(env, member, 'customer_contacts', intoId),
  ])
  if (fromSpace !== intoSpace) fail(400, 'bad_request', 'Contacts in different Spaces cannot be joined')
  const [identities, conversations] = await Promise.all([
    env.DB.prepare('SELECT id FROM customer_identities WHERE contact_id = ?').bind(fromId).all<{ id: string }>(),
    env.DB.prepare('SELECT channel_id AS id FROM customer_conversations WHERE contact_id = ?').bind(fromId).all<{ id: string }>(),
  ])
  const at = nowIso()
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE customer_contacts SET
         first_seen_at = min(first_seen_at, (SELECT first_seen_at FROM customer_contacts WHERE id = ?1)),
         last_seen_at = nullif(max(coalesce(last_seen_at, ''), coalesce((SELECT last_seen_at FROM customer_contacts WHERE id = ?1), '')), ''),
         last_contacted_at = nullif(max(coalesce(last_contacted_at, ''), coalesce((SELECT last_contacted_at FROM customer_contacts WHERE id = ?1), '')), ''),
         owner_id = coalesce(owner_id, (SELECT owner_id FROM customer_contacts WHERE id = ?1)), updated_at = ?3
       WHERE id = ?2`,
    ).bind(fromId, intoId, at),
    env.DB.prepare('UPDATE customer_identities SET contact_id = ?, updated_at = ? WHERE contact_id = ?').bind(intoId, at, fromId),
    env.DB.prepare('UPDATE customer_conversations SET contact_id = ?, updated_at = ? WHERE contact_id = ?').bind(intoId, at, fromId),
    env.DB.prepare(`INSERT OR IGNORE INTO customer_contact_companies (contact_id, company_id, title, current, linked_by, created_at, updated_at)
      SELECT ?, company_id, title, current, linked_by, created_at, ? FROM customer_contact_companies WHERE contact_id = ?`).bind(intoId, at, fromId),
    await auditStatement(env, { serverId: member.serverId, actorId: member.user.id, action: 'customer_contact.merge', targetType: 'customer_contact',
      targetId: intoId, meta: { from: fromId, identities: (identities.results ?? []).map(row => row.id), conversations: (conversations.results ?? []).map(row => row.id) },
      authorization: member.authorization }),
    env.DB.prepare('DELETE FROM customer_contacts WHERE id = ?').bind(fromId),
  ])
  return { contactId: intoId }
}

type CompanyRow = Omit<CustomerCompanyDTO, 'domains'> & { domainsJson: string }

const companyColumns = `co.id, co.space_id AS spaceId, co.name, co.owner_id AS ownerId, co.created_at AS createdAt,
  (SELECT json_group_array(domain) FROM (SELECT domain FROM customer_company_domains WHERE company_id = co.id ORDER BY domain)) AS domainsJson,
  (SELECT count(*) FROM customer_contact_companies l WHERE l.company_id = co.id AND l.current = 1) AS contactCount`

function companyDto(row: CompanyRow): CustomerCompanyDTO {
  const { domainsJson, ...company } = row
  return { ...company, domains: parseJson<string>(domainsJson), contactCount: Number(company.contactCount) }
}

export async function listCustomerCompanies(env: ZugoidEnv, member: ServerMembership, input: { search?: string | null } = {}): Promise<CustomerCompanyDTO[]> {
  await requireCustomersReader(env, member)
  const term = input.search?.trim().toLowerCase().slice(0, 200) || null
  const rows = await env.DB.prepare(
    `SELECT ${companyColumns} FROM customer_companies co
     WHERE co.space_id IN (${readableSpaces(member)})
       AND (?1 IS NULL OR instr(lower(co.name), ?1) > 0
         OR EXISTS (SELECT 1 FROM customer_company_domains d WHERE d.company_id = co.id AND instr(d.domain, ?1) > 0))
     ORDER BY lower(co.name), co.id LIMIT ${CUSTOMER_PAGE}`,
  ).bind(term).all<CompanyRow>()
  return (rows.results ?? []).map(companyDto)
}

export async function readCustomerCompany(env: ZugoidEnv, member: ServerMembership, companyId: string): Promise<{ company: CustomerCompanyDTO; contacts: CustomerContactDTO[] }> {
  await requireCustomersReader(env, member)
  const company = await env.DB.prepare(`SELECT ${companyColumns} FROM customer_companies co WHERE co.id = ? AND co.space_id IN (${readableSpaces(member)})`)
    .bind(companyId).first<CompanyRow>()
  if (!company) fail(404, 'not_found', 'Company not found')
  return { company: companyDto(company), contacts: await listCustomerContacts(env, member, { companyId }) }
}

function companyDomains(values: string[]): string[] {
  const domains = [...new Set(values.map((value) => {
    const domain = normalizeCompanyDomain(value)
    if (!domain) fail(400, 'bad_request', `${value} is not a domain`)
    if (FREE_MAIL_DOMAINS.has(domain)) fail(400, 'bad_request', `${domain} is a free mail provider, not a company's domain`)
    return domain
  }))]
  if (domains.length > 20) fail(400, 'bad_request', 'A Company can have at most 20 domains')
  return domains
}

/** Contacts with a verified email on one of these domains join the Company. */
function linkByDomainStatement(env: ZugoidEnv, companyId: string, at: string) {
  return env.DB.prepare(
    `INSERT OR IGNORE INTO customer_contact_companies (contact_id, company_id, linked_by, created_at, updated_at)
     SELECT DISTINCT i.contact_id, d.company_id, 'domain', ?2, ?2 FROM customer_company_domains d
     JOIN customer_identities i ON i.space_id = d.space_id AND i.kind = 'email' AND i.verified_at IS NOT NULL
       AND substr(i.value, instr(i.value, '@') + 1) = d.domain
     WHERE d.company_id = ?1`,
  ).bind(companyId, at)
}

async function domainTaken(env: ZugoidEnv, spaceId: string, domains: string[], exceptCompanyId: string | null) {
  if (!domains.length) return
  const taken = await env.DB.prepare(
    `SELECT domain FROM customer_company_domains WHERE space_id = ? AND domain IN (${domains.map(() => '?').join(',')}) AND company_id IS NOT ?`,
  ).bind(spaceId, ...domains, exceptCompanyId).first<{ domain: string }>()
  if (taken) fail(409, 'conflict', `${taken.domain} already belongs to another Company`)
}

export async function createCustomerCompany(env: ZugoidEnv, member: ServerMembership, input: { name: string; domains: string[]; spaceId: string }) {
  await requireCustomersReader(env, member)
  const writable = await env.DB.prepare(`SELECT 1 AS ok WHERE ? IN (SELECT space_id FROM channels WHERE id IN (${writableSources(member)}))`).bind(input.spaceId).first()
  if (!writable) fail(403, 'forbidden', 'Changing Customers takes a Mailbox you can send from or a Widget you answer')
  const domains = companyDomains(input.domains)
  await domainTaken(env, input.spaceId, domains, null)
  const id = newId()
  const at = nowIso()
  await env.DB.batch([
    env.DB.prepare('INSERT INTO customer_companies (id, space_id, name, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, input.spaceId, input.name, member.user.id, at, at),
    ...domains.map(domain => env.DB.prepare('INSERT INTO customer_company_domains (space_id, domain, company_id, created_at) VALUES (?, ?, ?, ?)').bind(input.spaceId, domain, id, at)),
    linkByDomainStatement(env, id, at),
    await auditStatement(env, { serverId: member.serverId, actorId: member.user.id, action: 'customer_company.create', targetType: 'customer_company',
      targetId: id, meta: { name: input.name, domains }, authorization: member.authorization }),
  ])
  return { companyId: id }
}

export async function updateCustomerCompany(env: ZugoidEnv, member: ServerMembership, companyId: string, input: { name?: string; domains?: string[]; ownerId?: string | null }) {
  const spaceId = await requireWritableSpace(env, member, 'customer_companies', companyId)
  const domains = input.domains ? companyDomains(input.domains) : null
  if (domains) await domainTaken(env, spaceId, domains, companyId)
  if (input.ownerId && !await env.DB.prepare("SELECT 1 AS ok FROM space_members m JOIN users u ON u.id = m.user_id WHERE m.space_id = ? AND m.user_id = ? AND u.status = 'active'")
    .bind(spaceId, input.ownerId).first()) fail(400, 'bad_request', 'The owner must be a Member of this Space')
  const at = nowIso()
  await env.DB.batch([
    env.DB.prepare('UPDATE customer_companies SET name = coalesce(?, name), owner_id = CASE WHEN ? = 1 THEN ? ELSE owner_id END, updated_at = ? WHERE id = ?')
      .bind(input.name ?? null, input.ownerId === undefined ? 0 : 1, input.ownerId ?? null, at, companyId),
    ...domains
      ? [
          env.DB.prepare('DELETE FROM customer_company_domains WHERE company_id = ?').bind(companyId),
          ...domains.map(domain => env.DB.prepare('INSERT INTO customer_company_domains (space_id, domain, company_id, created_at) VALUES (?, ?, ?, ?)').bind(spaceId, domain, companyId, at)),
          linkByDomainStatement(env, companyId, at),
        ]
      : [],
    await auditStatement(env, { serverId: member.serverId, actorId: member.user.id, action: 'customer_company.update', targetType: 'customer_company',
      targetId: companyId, meta: { ...input, ...domains ? { domains } : {} }, authorization: member.authorization }),
  ])
}

/** Removes a Company and every Contact's place in it. Its Contacts stay. */
export async function deleteCustomerCompany(env: ZugoidEnv, member: ServerMembership, companyId: string) {
  await requireWritableSpace(env, member, 'customer_companies', companyId)
  await env.DB.batch([
    await auditStatement(env, { serverId: member.serverId, actorId: member.user.id, action: 'customer_company.delete', targetType: 'customer_company',
      targetId: companyId, authorization: member.authorization }),
    env.DB.prepare('DELETE FROM customer_companies WHERE id = ?').bind(companyId),
  ])
}

/** Puts a Contact in a Company of the same Space, or changes its title or whether it is current. */
export async function setContactCompany(env: ZugoidEnv, member: ServerMembership, contactId: string, companyId: string, input: { title?: string; current?: boolean }) {
  const [contactSpace, companySpace] = await Promise.all([
    requireWritableSpace(env, member, 'customer_contacts', contactId),
    requireWritableSpace(env, member, 'customer_companies', companyId),
  ])
  if (contactSpace !== companySpace) fail(400, 'bad_request', 'The Contact and the Company are in different Spaces')
  const at = nowIso()
  await env.DB.prepare(
    `INSERT INTO customer_contact_companies (contact_id, company_id, title, current, linked_by, created_at, updated_at) VALUES (?1, ?2, coalesce(?3, ''), coalesce(?4, 1), 'member', ?5, ?5)
     ON CONFLICT(contact_id, company_id) DO UPDATE SET title = coalesce(?3, title), current = coalesce(?4, current), updated_at = ?5`,
  ).bind(contactId, companyId, input.title ?? null, input.current === undefined ? null : input.current ? 1 : 0, at).run()
}

export async function removeContactCompany(env: ZugoidEnv, member: ServerMembership, contactId: string, companyId: string) {
  await requireWritableSpace(env, member, 'customer_contacts', contactId)
  await env.DB.prepare('DELETE FROM customer_contact_companies WHERE contact_id = ? AND company_id = ?').bind(contactId, companyId).run()
}
