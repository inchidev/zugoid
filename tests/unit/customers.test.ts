import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { INIT_SQL } from '../../server/utils/db'
import { createCustomerCompany, listCustomerContacts, mergeCustomerContacts, readCustomerCompany, readCustomerContact, setContactCompany, updateCustomerContact } from '../../server/utils/customers'
import type { ServerMembership } from '../../server/utils/channel-access'
import { ALL_PERMISSIONS, Permission } from '../../shared/permissions'
import { DEFAULT_SPACE_ID } from '../../shared/spaces'
import type { ZugoidEnv } from '../../workers/env'
import { emailPersonStatements } from '../../workers/customer-records'
import { ingestServerEmail } from '../../workers/mail-ingress'
import { mailboxGrantsSql } from '../helpers/grants'
import { d1 } from '../helpers/sqlite-d1'

let sqlite: DatabaseSync
let env: ZugoidEnv

function receive(input: { id: string; from: string; name?: string; inReplyTo?: string; verified?: boolean }) {
  const raw = [
    `From: ${input.name ? `${input.name} <${input.from}>` : input.from}`,
    'To: support@example.com',
    'Subject: Help',
    `Message-ID: ${input.id}`,
    ...(input.inReplyTo ? [`In-Reply-To: ${input.inReplyTo}`, `References: ${input.inReplyTo}`] : []),
    'Content-Type: text/plain',
    '',
    'Hello',
  ].join('\r\n')
  const bytes = new TextEncoder().encode(raw)
  return ingestServerEmail({
    from: input.from, to: 'support@example.com',
    raw: new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close() } }),
    authResults: input.verified === false ? null : { dmarc: 'pass' },
  }, env)
}

function member(id: string, perms = Permission.readMail): ServerMembership {
  return { user: { id }, serverId: '00000000-0000-4000-8000-000000000001', isOwner: false, perms, authorization: { principal: { id, kind: 'human' }, credential: { kind: 'session' }, spaces: { ids: [DEFAULT_SPACE_ID], active: DEFAULT_SPACE_ID, denied: {} } } } as unknown as ServerMembership
}

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec(INIT_SQL)
  sqlite.exec(`
    INSERT INTO roles (id, key, name, permissions_bitmask) VALUES ('member', 'member', 'Member', ${ALL_PERMISSIONS});
    INSERT INTO users (id, display_name, status, role_id, joined_at) VALUES ('owner', 'Owner', 'active', 'member', '2026-09-01T00:00:00.000Z'),
      ('outsider', 'Outsider', 'active', 'member', '2026-09-01T00:00:00.000Z'), ('mail-external', 'Email', 'removed', NULL, NULL);
    INSERT INTO server_identity(singleton,id) VALUES(1,'00000000-0000-4000-8000-000000000001');
    INSERT INTO server(id,name,owner_id) VALUES('00000000-0000-4000-8000-000000000001','Customers test','owner');
    INSERT INTO channels (id, name, type, visibility) VALUES ('support', 'support', 'text', 'private'), ('general', 'general', 'text', 'server');
    INSERT INTO email_domains (id, zone_id, domain, app_hostname) VALUES ('main', 'zone', 'example.com', 'chat.example.com');
    INSERT INTO email_mailboxes (channel_id, domain_id, local_part, display_name) VALUES ('support', 'main', 'support', 'Support');
    INSERT INTO users (id, display_name, status, role_id, joined_at) VALUES ('reader', 'Reader', 'active', 'member', '2026-09-01T00:00:00.000Z');
    ${mailboxGrantsSql(['support', 'owner', 'manage'], ['support', 'reader', 'read'])}
  `)
  env = { DB: d1(sqlite), SERVER_DO: { getByName: () => ({ notifyMailChanged: async () => {} }) } } as unknown as ZugoidEnv
})

afterEach(() => sqlite.close())

describe('a Mailbox is a Source in Customers', () => {
  it('puts the Mailbox and its Conversations in Customers, and leaves Chat channels in Chat', async () => {
    await receive({ id: '<a@example.net>', from: 'vasya@example.net', name: 'Vasya' })
    expect(sqlite.prepare("SELECT kind FROM customer_sources WHERE channel_id = 'support'").get()).toEqual({ kind: 'mailbox' })
    expect(sqlite.prepare('SELECT id, type, section FROM channels ORDER BY type, id').all()).toEqual([
      { id: expect.any(String), type: 'conversation', section: 'customers' },
      { id: 'general', type: 'text', section: 'chat' },
      { id: 'support', type: 'text', section: 'customers' },
    ])
  })

  it('keeps the first email inside its Conversation, not in the Mailbox', async () => {
    await receive({ id: '<a@example.net>', from: 'vasya@example.net' })
    expect(sqlite.prepare("SELECT count(*) AS n FROM messages WHERE channel_id = 'support'").get()).toEqual({ n: 0 })
    expect(sqlite.prepare("SELECT c.type FROM messages m JOIN channels c ON c.id = m.channel_id").get()).toEqual({ type: 'conversation' })
  })

  it('refuses a Conversation under a Chat channel', () => {
    expect(() => sqlite.exec("INSERT INTO channels (id, name, type, section, visibility, parent_id) VALUES ('x', 'x', 'conversation', 'customers', 'private', 'general')"))
      .toThrow(/channels_conversation_section_check/u)
  })
})

describe('Contacts from email', () => {
  it('makes one Contact per address, named from the email, and puts each Conversation on it', async () => {
    await receive({ id: '<a@example.net>', from: 'Vasya@Example.net', name: 'Vasya' })
    await receive({ id: '<b@example.net>', from: 'vasya@example.net', name: 'Vasya' })
    const contacts = sqlite.prepare('SELECT id, name, last_seen_at IS NOT NULL AS seen FROM customer_contacts').all() as Array<{ id: string; name: string; seen: number }>
    expect(contacts).toEqual([{ id: expect.any(String), name: 'Vasya', seen: 1 }])
    expect(sqlite.prepare('SELECT DISTINCT contact_id AS c FROM customer_conversations').all()).toEqual([{ c: contacts[0]!.id }])
    expect(sqlite.prepare('SELECT count(*) AS n FROM customer_conversations').get()).toEqual({ n: 2 })
    expect(sqlite.prepare('SELECT value, verified_by FROM customer_identities').all()).toEqual([{ value: 'vasya@example.net', verified_by: 'sender_auth' }])
  })

  it('verifies an address only when sender authentication passed', async () => {
    await receive({ id: '<a@example.net>', from: 'petya@example.net', verified: false })
    expect(sqlite.prepare('SELECT verified_at FROM customer_identities').get()).toEqual({ verified_at: null })
    await receive({ id: '<b@example.net>', from: 'petya@example.net' })
    expect(sqlite.prepare('SELECT verified_by FROM customer_identities').get()).toEqual({ verified_by: 'sender_auth' })
  })

  it('names a Contact first met by writing to it once it writes back with a name', async () => {
    await env.DB.batch(emailPersonStatements(env, { sourceChannelId: 'support', address: 'lead@example.org', at: '2026-10-01T00:00:00.000Z', direction: 'outbound' }))
    expect(sqlite.prepare('SELECT name, last_seen_at, last_contacted_at FROM customer_contacts').get())
      .toEqual({ name: 'lead@example.org', last_seen_at: null, last_contacted_at: '2026-10-01T00:00:00.000Z' })
    await receive({ id: '<c@example.org>', from: 'lead@example.org', name: 'Lena' })
    expect(sqlite.prepare('SELECT name FROM customer_contacts').get()).toEqual({ name: 'Lena' })
  })
})

describe('who sees Contacts', () => {
  it('shows Contacts and their Conversations to a Member with a Mailbox grant, and nothing to others', async () => {
    await receive({ id: '<a@example.net>', from: 'vasya@example.net', name: 'Vasya' })
    const [contact] = await listCustomerContacts(env, member('owner'))
    expect(contact).toMatchObject({ name: 'Vasya', emails: [{ address: 'vasya@example.net', verified: true }], conversationCount: 1 })
    expect(await listCustomerContacts(env, member('owner'), { search: 'VASYA@' })).toHaveLength(1)
    expect(await listCustomerContacts(env, member('owner'), { search: 'nobody' })).toEqual([])
    const detail = await readCustomerContact(env, member('owner'), contact!.id)
    expect(detail.conversations).toEqual([expect.objectContaining({ sourceChannelId: 'support', sourceKind: 'mailbox', sourceName: 'Support', subject: 'Help', status: 'open' })])

    expect(await listCustomerContacts(env, member('outsider'))).toEqual([])
    await expect(readCustomerContact(env, member('outsider'), contact!.id)).rejects.toMatchObject({ statusCode: 404 })
    await expect(listCustomerContacts(env, member('owner', 0))).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('Companies and joining Contacts', () => {
  const writer = () => member('owner', Permission.readMail | Permission.sendMail)
  const contactOf = (address: string) => (sqlite.prepare('SELECT contact_id AS id FROM customer_identities WHERE value = ?').get(address) as { id: string }).id

  it('puts Contacts with a verified address on its domain into a Company, now and later', async () => {
    await receive({ id: '<a@acme.test>', from: 'ann@acme.test', name: 'Ann' })
    await receive({ id: '<b@acme.test>', from: 'bob@acme.test', name: 'Bob', verified: false })
    const { companyId } = await createCustomerCompany(env, writer(), { name: 'Acme', domains: ['https://www.Acme.test/'], spaceId: DEFAULT_SPACE_ID })
    await receive({ id: '<c@acme.test>', from: 'cid@acme.test', name: 'Cid' })
    const { company, contacts } = await readCustomerCompany(env, writer(), companyId)
    expect(company).toMatchObject({ name: 'Acme', domains: ['acme.test'], contactCount: 2 })
    expect(contacts.map(contact => contact.name).sort()).toEqual(['Ann', 'Cid'])
    expect(contacts[0]!.companies).toEqual([expect.objectContaining({ id: companyId, linkedBy: 'domain', current: true })])
  })

  it('refuses a free mail domain and a domain another Company has', async () => {
    await expect(createCustomerCompany(env, writer(), { name: 'Gmail', domains: ['gmail.com'], spaceId: DEFAULT_SPACE_ID })).rejects.toMatchObject({ statusCode: 400 })
    await createCustomerCompany(env, writer(), { name: 'Acme', domains: ['acme.test'], spaceId: DEFAULT_SPACE_ID })
    await expect(createCustomerCompany(env, writer(), { name: 'Copy', domains: ['acme.test'], spaceId: DEFAULT_SPACE_ID })).rejects.toMatchObject({ statusCode: 409 })
  })

  it('joins one Contact into another with its addresses, Conversations and Companies, and records what moved', async () => {
    await receive({ id: '<a@example.net>', from: 'vasya@example.net', name: 'Vasya' })
    await receive({ id: '<b@example.org>', from: 'v.petrov@example.org', name: 'V. Petrov' })
    const [into, from] = [contactOf('vasya@example.net'), contactOf('v.petrov@example.org')]
    const { companyId } = await createCustomerCompany(env, writer(), { name: 'Acme', domains: [], spaceId: DEFAULT_SPACE_ID })
    await setContactCompany(env, writer(), from, companyId, { title: 'CTO' })
    await mergeCustomerContacts(env, writer(), from, into)
    const { contact, conversations } = await readCustomerContact(env, writer(), into)
    expect(contact.emails.map(email => email.address).sort()).toEqual(['v.petrov@example.org', 'vasya@example.net'])
    expect(contact.companies).toEqual([expect.objectContaining({ id: companyId, title: 'CTO', linkedBy: 'member' })])
    expect(conversations).toHaveLength(2)
    expect(sqlite.prepare('SELECT count(*) AS n FROM customer_contacts').get()).toEqual({ n: 1 })
    const audit = sqlite.prepare("SELECT target_id, meta_json, space_id FROM audit_log WHERE action = 'customer_contact.merge'").get() as { target_id: string; meta_json: string; space_id: string }
    expect(audit.target_id).toBe(into)
    expect(audit.space_id).toBe(DEFAULT_SPACE_ID)
    expect(JSON.parse(audit.meta_json)).toMatchObject({ from, identities: [expect.any(String)], conversations: [expect.any(String)] })
  })

  it('lets a read-only Mailbox grant see Contacts but not change them', async () => {
    await receive({ id: '<a@example.net>', from: 'vasya@example.net', name: 'Vasya' })
    const id = contactOf('vasya@example.net')
    const reader = member('reader', Permission.readMail | Permission.sendMail)
    expect(await listCustomerContacts(env, reader)).toHaveLength(1)
    await expect(updateCustomerContact(env, reader, id, { name: 'Changed' })).rejects.toMatchObject({ statusCode: 403 })
    await updateCustomerContact(env, writer(), id, { name: 'Vasily' })
    expect((await readCustomerContact(env, reader, id)).contact.name).toBe('Vasily')
  })
})
