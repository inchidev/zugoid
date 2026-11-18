import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { INIT_SQL } from '../../server/utils/db'
import type { ServerMembership } from '../../server/utils/channel-access'
import { listCustomerContacts, mergeCustomerContacts } from '../../server/utils/customers'
import {
  createCustomerWidget, listCustomerWidgets, listWidgetConversations, postCustomerConversationMessage, readCustomerConversation,
  setCustomerWidgetMembers, updateCustomerConversation, updateCustomerWidget,
} from '../../server/utils/customer-widgets'
import { bearerToken, findPublicWidget, listVisitorMessages, postVisitorMessage, requireVisitor, startVisitorSession } from '../../server/utils/widget-visitors'
import { widgetFrameHtml, widgetLoaderScript } from '../../server/utils/widget-pages'
import { normalizeWidgetSite, widgetFrameCsp, widgetSiteAllows } from '../../shared/customer-widgets'
import { ALL_PERMISSIONS } from '../../shared/permissions'
import { DEFAULT_SPACE_ID } from '../../shared/spaces'
import type { ZugoidEnv } from '../../workers/env'
import { d1 } from '../helpers/sqlite-d1'

let sqlite: DatabaseSync
let env: ZugoidEnv

function member(id: string, perms = 0, isOwner = false): ServerMembership {
  return {
    user: { id }, serverId: '00000000-0000-4000-8000-000000000001', ownerId: 'owner', isOwner, perms,
    authorization: { principal: { id, kind: 'human' }, credential: { kind: 'session' }, spaces: { ids: [DEFAULT_SPACE_ID], active: DEFAULT_SPACE_ID, denied: {} } },
  } as unknown as ServerMembership
}
const owner = () => member('owner', ALL_PERMISSIONS, true)

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec(INIT_SQL)
  sqlite.exec(`
    INSERT INTO roles (id, key, name, permissions_bitmask) VALUES ('member', 'member', 'Member', ${ALL_PERMISSIONS});
    INSERT INTO users (id, display_name, status, role_id, joined_at) VALUES ('owner', 'Owner', 'active', 'member', '2026-09-01T00:00:00.000Z'),
      ('agent-smith', 'Smith', 'active', 'member', '2026-09-01T00:00:00.000Z'), ('outsider', 'Outsider', 'active', 'member', '2026-09-01T00:00:00.000Z');
    INSERT INTO server_identity(singleton,id) VALUES(1,'00000000-0000-4000-8000-000000000001');
    INSERT INTO server(id,name,owner_id) VALUES('00000000-0000-4000-8000-000000000001','Widget test','owner');
  `)
  env = { DB: d1(sqlite) } as unknown as ZugoidEnv
})

afterEach(() => sqlite.close())

async function widget(sites = ['https://example.com']) {
  const { channelId } = await createCustomerWidget(env, owner(), { spaceId: DEFAULT_SPACE_ID, name: 'Support', sites, greeting: 'Hi!' })
  const { publicId } = sqlite.prepare('SELECT public_id AS publicId FROM customer_widgets WHERE channel_id = ?').get(channelId) as { publicId: string }
  return { channelId, publicId, public: await findPublicWidget(env, publicId) }
}

async function visitor(publicWidget: Awaited<ReturnType<typeof widget>>['public'], input: { name?: string; email?: string } = {}) {
  const { token } = await startVisitorSession(env, publicWidget, { ...input, userAgent: 'Test browser', country: 'DE' })
  return { token, visitor: await requireVisitor(env, publicWidget, bearerToken(`Bearer ${token}`)) }
}

describe('a Widget is a Source in Customers', () => {
  it('is a private channel in Customers, answered by its creator and the Owner', async () => {
    const { channelId, publicId } = await widget()
    expect(sqlite.prepare('SELECT section, visibility, type FROM channels WHERE id = ?').get(channelId)).toEqual({ section: 'customers', visibility: 'private', type: 'text' })
    expect(sqlite.prepare('SELECT kind FROM customer_sources WHERE channel_id = ?').get(channelId)).toEqual({ kind: 'widget' })
    expect(publicId).not.toBe(channelId)
    const [listed] = await listCustomerWidgets(env, owner(), 'https://chat.example.net')
    expect(listed).toMatchObject({ name: 'Support', sites: ['https://example.com'], member: true, canManage: true,
      embedCode: `<script src="https://chat.example.net/widget/${publicId}.js" async></script>` })
    // Someone who neither answers nor manages it does not see it.
    expect(await listCustomerWidgets(env, member('outsider'), 'https://chat.example.net')).toEqual([])
  })

  it('keeps its embed code when its sites change, and refuses what is not a site', async () => {
    const { channelId, publicId } = await widget()
    await updateCustomerWidget(env, owner(), channelId, { sites: ['https://shop.example.com', 'https://*.example.org/'] })
    expect((await findPublicWidget(env, publicId)).sites).toEqual(['https://shop.example.com', 'https://*.example.org'])
    for (const bad of ['http://example.com', 'https://example.com/path', 'https://*.com', 'example.com', 'https://*']) {
      await expect(updateCustomerWidget(env, owner(), channelId, { sites: [bad] }), bad).rejects.toMatchObject({ statusCode: 400 })
    }
    await expect(updateCustomerWidget(env, member('agent-smith'), channelId, { name: 'Mine' })).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('a Visitor', () => {
  it('gets a browser Identity, a numbered Contact and a Conversation from the first message', async () => {
    const { channelId, public: site } = await widget()
    const { token, visitor: v } = await visitor(site)
    expect(sqlite.prepare('SELECT token_hash FROM customer_visitors').get()).not.toEqual({ token_hash: token })
    await postVisitorMessage(env, site, v, { content: 'Hello, is anyone there?' })
    await postVisitorMessage(env, site, v, { content: 'Second line' })
    expect(sqlite.prepare("SELECT kind, value, verified_at FROM customer_identities").all()).toEqual([{ kind: 'browser', value: v.id, verified_at: null }])
    expect(sqlite.prepare('SELECT name, last_seen_at IS NOT NULL AS seen FROM customer_contacts').all()).toEqual([{ name: 'Visitor 1', seen: 1 }])
    const conversations = await listWidgetConversations(env, owner(), channelId, 'open')
    expect(conversations).toEqual([expect.objectContaining({ contactName: 'Visitor 1', preview: 'Second line', status: 'open' })])
    expect(sqlite.prepare("SELECT c.type, c.section, c.parent_id AS parentId FROM channels c WHERE c.type = 'conversation'").all())
      .toEqual([{ type: 'conversation', section: 'customers', parentId: channelId }])
    expect(sqlite.prepare("SELECT author_id FROM messages").all()).toEqual([{ author_id: 'customer-visitor' }, { author_id: 'customer-visitor' }])
  })

  it('keeps a typed email as a claim that never becomes an email Identity', async () => {
    const { public: site } = await widget()
    const { visitor: v } = await visitor(site, { name: 'Vasya', email: 'Vasya@Example.net' })
    await postVisitorMessage(env, site, v, { content: 'Hi' })
    expect(sqlite.prepare('SELECT claimed_name, claimed_email, country, user_agent FROM customer_visitors').get())
      .toEqual({ claimed_name: 'Vasya', claimed_email: 'vasya@example.net', country: 'DE', user_agent: 'Test browser' })
    expect(sqlite.prepare("SELECT count(*) AS n FROM customer_identities WHERE kind = 'email'").get()).toEqual({ n: 0 })
    expect(sqlite.prepare('SELECT name FROM customer_contacts').get()).toEqual({ name: 'Vasya' })
  })

  it('reads the team’s replies but never its notes', async () => {
    const { public: site } = await widget()
    const { visitor: v } = await visitor(site)
    await postVisitorMessage(env, site, v, { content: 'Question' })
    const first = await listVisitorMessages(env, site, v)
    expect(first.messages).toEqual([expect.objectContaining({ direction: 'inbound', content: 'Question', authorName: null })])
    const conversationId = (sqlite.prepare('SELECT channel_id AS id FROM customer_conversations').get() as { id: string }).id
    await postCustomerConversationMessage(env, owner(), conversationId, { content: 'Internal: VIP customer', kind: 'note' })
    await postCustomerConversationMessage(env, owner(), conversationId, { content: 'Answer', kind: 'reply' })
    const next = await listVisitorMessages(env, site, v, first.cursor)
    expect(next.messages).toEqual([expect.objectContaining({ direction: 'outbound', content: 'Answer', authorName: 'Owner' })])
    expect((await listVisitorMessages(env, site, v, next.cursor)).messages).toEqual([])
    const team = await readCustomerConversation(env, owner(), conversationId)
    expect(team.messages.map(message => [message.content, message.direction])).toEqual([['Question', 'inbound'], ['Internal: VIP customer', null], ['Answer', 'outbound']])
    expect(team.visitor).toMatchObject({ country: 'DE' })
  })

  it('cannot read another Visitor’s Conversation, nor use a token on another Widget', async () => {
    const { public: site } = await widget()
    const { public: other } = await widget(['https://other.example'])
    const a = await visitor(site)
    const b = await visitor(site)
    await postVisitorMessage(env, site, a.visitor, { content: 'Secret from A' })
    expect((await listVisitorMessages(env, site, b.visitor)).messages).toEqual([])
    await expect(requireVisitor(env, other, a.token)).rejects.toMatchObject({ statusCode: 401 })
    await expect(requireVisitor(env, site, null)).rejects.toMatchObject({ statusCode: 401 })
    expect(bearerToken(`Basic ${a.token}`)).toBeNull()
  })

  it('never sees what the team joined into its Contact', async () => {
    const { public: site } = await widget()
    const a = await visitor(site)
    const b = await visitor(site)
    await postVisitorMessage(env, site, a.visitor, { content: 'From A' })
    await postVisitorMessage(env, site, b.visitor, { content: 'From B' })
    const contactOf = (identityId: string) => (sqlite.prepare('SELECT contact_id AS id FROM customer_identities WHERE id = ?').get(identityId) as { id: string }).id
    await mergeCustomerContacts(env, owner(), contactOf(a.visitor.identityId), contactOf(b.visitor.identityId))
    expect((await listVisitorMessages(env, site, b.visitor)).messages.map(message => message.content)).toEqual(['From B'])
    expect((await listVisitorMessages(env, site, a.visitor)).messages.map(message => message.content)).toEqual(['From A'])
  })

  it('starts a new Conversation once the last one is resolved', async () => {
    const { channelId, public: site } = await widget()
    const { visitor: v } = await visitor(site)
    await postVisitorMessage(env, site, v, { content: 'One' })
    const [first] = await listWidgetConversations(env, owner(), channelId, 'open')
    await updateCustomerConversation(env, owner(), first!.channelId, { status: 'waiting', assigneeId: 'agent-smith' })
    await postVisitorMessage(env, site, v, { content: 'Two' })
    expect(await listWidgetConversations(env, owner(), channelId, 'open')).toEqual([expect.objectContaining({ channelId: first!.channelId, assigneeId: 'agent-smith' })])
    await updateCustomerConversation(env, owner(), first!.channelId, { status: 'resolved' })
    await postVisitorMessage(env, site, v, { content: 'Three' })
    expect(sqlite.prepare('SELECT count(*) AS n FROM customer_conversations').get()).toEqual({ n: 2 })
    expect((await listVisitorMessages(env, site, v)).messages.map(message => message.content)).toEqual(['One', 'Two', 'Three'])
    await expect(updateCustomerConversation(env, owner(), first!.channelId, { assigneeId: 'nobody' })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('finds no Widget that is unknown or turned off', async () => {
    const { channelId, publicId } = await widget()
    await expect(findPublicWidget(env, 'unknown-widget-id-123')).rejects.toMatchObject({ statusCode: 404 })
    await expect(findPublicWidget(env, '../etc')).rejects.toMatchObject({ statusCode: 404 })
    await updateCustomerWidget(env, owner(), channelId, { enabled: false })
    await expect(findPublicWidget(env, publicId)).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('the team that answers a Widget', () => {
  it('sees its Conversations and Contacts without a Mailbox, and nobody else does', async () => {
    const { channelId, public: site } = await widget()
    const { visitor: v } = await visitor(site)
    await postVisitorMessage(env, site, v, { content: 'Hello' })
    const [conversation] = await listWidgetConversations(env, owner(), channelId, 'open')
    await expect(listWidgetConversations(env, member('agent-smith'), channelId, 'open')).rejects.toMatchObject({ statusCode: 404 })
    await expect(readCustomerConversation(env, member('agent-smith'), conversation!.channelId)).rejects.toMatchObject({ statusCode: 404 })
    await expect(listCustomerContacts(env, member('agent-smith'))).rejects.toMatchObject({ statusCode: 404 })
    await setCustomerWidgetMembers(env, owner(), channelId, ['agent-smith'])
    expect(await listCustomerContacts(env, member('agent-smith'))).toEqual([expect.objectContaining({ name: 'Visitor 1', conversationCount: 1 })])
    await postCustomerConversationMessage(env, member('agent-smith'), conversation!.channelId, { content: 'On it', kind: 'reply' })
    expect(sqlite.prepare('SELECT user_id FROM channel_members WHERE channel_id = ? ORDER BY user_id').all(channelId)).toEqual([{ user_id: 'agent-smith' }, { user_id: 'owner' }])
  })

  it('never lists Widget Conversations in Chat', async () => {
    const { public: site } = await widget()
    const { visitor: v } = await visitor(site)
    await postVisitorMessage(env, site, v, { content: 'Hello' })
    expect(sqlite.prepare("SELECT count(*) AS n FROM channels WHERE section = 'chat'").get()).toEqual({ n: 0 })
  })
})

describe('the website side', () => {
  it('lets only the Widget’s sites frame it', () => {
    const policy = widgetFrameCsp(['https://example.com', 'https://*.example.org'])
    const directives = policy.split(';').map(part => part.trim())
    expect(directives.filter(part => part.startsWith('frame-ancestors'))).toEqual(['frame-ancestors https://example.com https://*.example.org'])
    expect(directives).toContain("connect-src 'self'")
    expect(widgetFrameCsp([])).toContain("frame-ancestors 'none'")
  })

  it('matches sites exactly, and wildcards only below their domain', () => {
    expect(normalizeWidgetSite('HTTPS://Example.com:443/')).toBe('https://example.com')
    expect(normalizeWidgetSite('https://example.com:8443')).toBe('https://example.com:8443')
    const sites = ['https://example.com', 'https://*.example.org']
    expect(widgetSiteAllows(sites, 'https://example.com')).toBe(true)
    expect(widgetSiteAllows(sites, 'https://www.example.com')).toBe(false)
    expect(widgetSiteAllows(sites, 'https://shop.example.org')).toBe(true)
    expect(widgetSiteAllows(sites, 'https://example.org')).toBe(false)
    expect(widgetSiteAllows(sites, 'https://evilexample.org')).toBe(false)
    expect(widgetSiteAllows(sites, 'http://example.com')).toBe(false)
  })

  it('escapes the Widget’s own text in the frame and the loader', () => {
    const html = widgetFrameHtml({ publicId: 'abcdefghijklmnop', name: '<img src=x onerror=alert(1)>', greeting: '</p><script>alert(1)</script>' })
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<script>alert(1)')
    const script = widgetLoaderScript({ serverOrigin: 'https://chat.example.net', publicId: 'abcdefghijklmnop', sites: ['https://example.com'] })
    expect(script).toContain('"origin":"https://chat.example.net"')
    expect(script).not.toContain('</script>')
  })
})

describe('the Widget look', () => {
  it('uses the Client\'s neutral house look by default, and the Server\'s Appearance accent and font when set', async () => {
    const { widgetLook } = await import('../../server/utils/widget-pages')
    const { parseServerTheme } = await import('../../shared/server-theme')
    expect(widgetLook()).toMatchObject({ light: { primary: '#171717', onPrimary: '#fafafa' }, dark: { primary: '#ededed', onPrimary: '#0a0a0a' } })
    expect(widgetLook().font).toContain('Geist')
    const themed = widgetLook(parseServerTheme(JSON.stringify({ accent: '#f59e0b', font: 'mono' })))
    expect(themed).toMatchObject({ light: { primary: '#f59e0b', onPrimary: '#000000' }, dark: { primary: '#f59e0b', onPrimary: '#000000' } })
    expect(themed.font).toContain('monospace')
  })

  it('puts the look into the loader and the frame, and lets the frame load the Server\'s font', async () => {
    const { widgetFrameHtml, widgetLoaderScript, widgetLook } = await import('../../server/utils/widget-pages')
    const look = widgetLook()
    expect(widgetFrameHtml({ publicId: 'abcdefghijklmnop', name: 'Zugoid', greeting: '' }, look)).toContain('--primary: #171717')
    expect(widgetLoaderScript({ serverOrigin: 'https://chat.example.net', publicId: 'abcdefghijklmnop', sites: ['https://example.com'], look })).toContain('"primary":"#171717"')
    expect(widgetFrameCsp(['https://example.com'])).toContain("font-src 'self'")
  })
})
