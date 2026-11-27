import { and, eq } from 'drizzle-orm'
import { bytesToHex } from '@noble/hashes/utils.js'
import { z } from 'zod'
import { APIError, createAuthEndpoint } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import { authAccounts, authSessions, authUsers, roles, server, users } from '../../drizzle/schema'
import { newId, nowIso } from '../../shared/ids'
import { getServerId } from '../../shared/server-id'
import { readServerSetting } from '../../shared/server-settings'
import { partnerDestination } from '../../shared/partner-destination'
import type { ZugoidEnv } from '../../workers/env'
import { signalMembersChanged } from '../../workers/member-events'
import { generatedUsername, placeholderEmail } from './account-identity'
import { provisionServerIn } from './bootstrap'
import { getDb } from './db'
import { requireFiles } from './cf'
import { revalidateLiveRooms } from './live'
import { writeAudit } from './messages'

/**
 * Partner sign-in. A partner's platform made this Server for its people, who never set a password here:
 * the partner's backend asks the platform for a ticket, the platform signs it with this Server's own key, and the
 * person opens `<origin>/partner#ticket=…`. The partner is the authority on who belongs: its owner becomes the Owner,
 * its people become Members, and a removal ticket takes a person out. Roles given inside the Server stay local.
 * The person is linked by the partner's own id for them (`providerId = 'partner'`), never by email.
 */

export const PARTNER_PROVIDER = 'partner'
/** The longest a ticket may live, and the clock difference forgiven. */
const MAX_LIFETIME_SECONDS = 120
const SKEW_SECONDS = 30
const LOGIN_COOKIE = '__Host-zugoid-partner-login'
const LOGIN_TTL = 600
const nonce = z.string().regex(/^[a-f0-9]{32}$/u)
const photoHash = z.string().regex(/^[a-f0-9]{64}$/u)
const directLogin = z.object({ state: nonce, photo: photoHash.nullable() })
const loginCookie = z.object({ state: nonce, next: z.string() })

export type PartnerTicket = {
  act: 'sign-in' | 'remove'
  sub: string
  name: string
  role: 'owner' | 'member'
  jti: string
  exp: number
  direct?: z.infer<typeof directLogin>
}

const claimsSchema = z.object({
  iss: z.literal('zugoid-platform'),
  aud: z.string(),
  act: z.enum(['sign-in', 'remove']),
  sub: z.string().trim().min(1).max(128),
  name: z.string().trim().max(80).default(''),
  role: z.enum(['owner', 'member']).default('member'),
  jti: z.string().regex(/^[\w-]{16,64}$/u),
  iat: z.number().int(),
  exp: z.number().int(),
  direct: directLogin.optional(),
})

export function partnerSignInKey(env: Pick<ZugoidEnv, 'PARTNER_SIGNIN_KEY'>): string | null {
  const key = env.PARTNER_SIGNIN_KEY?.trim() || ''
  return key.length >= 32 ? key : null
}

export function partnerLogin(env: ZugoidEnv) {
  const label = env.PARTNER_DISPLAY_NAME?.trim().slice(0, 60)
  const origin = env.PARTNER_LOGIN_ORIGIN
  const server = z.uuid().safeParse(env.SERVER_ID)
  if (!label || !origin || !server.success || !partnerSignInKey(env)) return null
  const url = URL.parse(origin)
  return url?.protocol === 'https:' && url.origin === origin ? { label, origin, server: server.data } : null
}

function base64urlBytes(value: string): Uint8Array<ArrayBuffer> | null {
  try { return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0)) }
  catch { return null }
}

/**
 * The ticket's claims when it is signed with this Server's key, meant for this Server's origin and this act, and
 * still fresh. Anything else is null: the caller says only that the link is invalid or expired.
 */
export async function readPartnerTicket(
  env: Pick<ZugoidEnv, 'PARTNER_SIGNIN_KEY' | 'PUBLIC_ORIGIN'>,
  token: string,
  act: PartnerTicket['act'],
  nowMs = Date.now(),
): Promise<PartnerTicket | null> {
  const key = partnerSignInKey(env)
  const origin = env.PUBLIC_ORIGIN ? new URL(env.PUBLIC_ORIGIN).origin : null
  if (!key || !origin || token.length > 4096) return null
  const [header, payload, signature, extra] = token.split('.')
  if (!header || !payload || !signature || extra !== undefined) return null
  const headerBytes = base64urlBytes(header)
  const payloadBytes = base64urlBytes(payload)
  const signatureBytes = base64urlBytes(signature)
  if (!headerBytes || !payloadBytes || !signatureBytes) return null
  try {
    const head = JSON.parse(new TextDecoder().decode(headerBytes)) as { alg?: string }
    if (head.alg !== 'HS256') return null
  }
  catch { return null }
  const hmac = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  if (!await crypto.subtle.verify('HMAC', hmac, signatureBytes, new TextEncoder().encode(`${header}.${payload}`))) return null
  let claims
  try { claims = claimsSchema.safeParse(JSON.parse(new TextDecoder().decode(payloadBytes))) }
  catch { return null }
  if (!claims.success) return null
  const { aud, iat, exp, iss: _issuer, ...ticket } = claims.data
  const now = Math.floor(nowMs / 1000)
  if (aud !== origin || ticket.act !== act) return null
  if (exp <= now - SKEW_SECONDS || iat > now + SKEW_SECONDS || exp - iat > MAX_LIFETIME_SECONDS) return null
  return { ...ticket, exp }
}

/** A ticket works once. Its id is the primary key of a verification row, so a second use fails on insert. */
export async function spendPartnerTicket(env: Pick<ZugoidEnv, 'DB'>, ticket: PartnerTicket): Promise<boolean> {
  const now = Date.now()
  await env.DB.prepare('DELETE FROM auth_verifications WHERE identifier = ? AND expires_at < ?').bind('partner-ticket', now).run()
  try {
    await env.DB.prepare('INSERT INTO auth_verifications (id, identifier, value, expires_at) VALUES (?, ?, ?, ?)')
      .bind(`partner-ticket:${ticket.direct?.state ?? ticket.jti}`, 'partner-ticket', ticket.act,
        ticket.direct ? now + LOGIN_TTL * 1000 : (ticket.exp + SKEW_SECONDS) * 1000).run()
    return true
  }
  catch { return false }
}

const sessionMarker = 'partner-session'

export async function isPartnerSession(env: ZugoidEnv, id: string) {
  return Boolean(await env.DB.prepare('SELECT id FROM auth_verifications WHERE id = ?')
    .bind(`${sessionMarker}:${id}`).first('id'))
}

async function markPartnerSession(env: ZugoidEnv, session: { id: string, expiresAt: Date }) {
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM auth_verifications WHERE identifier = ? AND expires_at < ?
      AND NOT EXISTS (SELECT 1 FROM auth_sessions WHERE id = substr(auth_verifications.id, ?) AND expires_at > ?)`)
      .bind(sessionMarker, Date.now(), sessionMarker.length + 2, Date.now()),
    env.DB.prepare('INSERT INTO auth_verifications (id, identifier, value, expires_at) VALUES (?, ?, ?, ?)')
      .bind(`${sessionMarker}:${session.id}`, sessionMarker, 'partner', session.expiresAt.getTime()),
  ])
}

/** Keep the partner's profile on the already linked Account. Avatars are served by the usual member-only route. */
async function syncPartnerProfile(env: ZugoidEnv, userId: string, name: string, photo: string | null, origin: string) {
  const db = getDb(env.DB)
  const row = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0]
  if (!row) return false
  const prefix = `${await getServerId(env.DB)}/users/${userId}/partner-avatar-`
  const previous = row.avatarR2Key?.startsWith(prefix) ? row.avatarR2Key : null
  let avatarR2Key = row.avatarR2Key
  if (photo) {
    const key = `${prefix}${photo}.webp`
    if (key !== previous) {
      try {
        const response = await fetch(`${origin}/b/${photo}.webp`, { redirect: 'manual', signal: AbortSignal.timeout(4000) })
        if (response.ok && response.headers.get('content-type') === 'image/webp') {
          const bytes = await response.arrayBuffer()
          const hash = bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
          if (bytes.byteLength <= 262_144 && hash === photo) {
            await requireFiles(env).put(key, bytes, { httpMetadata: { contentType: 'image/webp' } })
            avatarR2Key = key
          }
        }
      }
      catch { /* Keep the current picture if the provider or storage is temporarily unavailable. */ }
    }
  }
  else if (previous) avatarR2Key = null
  const displayName = name || row.displayName
  if (displayName === row.displayName && avatarR2Key === row.avatarR2Key) return false
  await db.batch([
    db.update(users).set({ displayName, avatarR2Key, updatedAt: nowIso() }).where(eq(users.id, userId)),
    db.update(authUsers).set({ name: displayName, updatedAt: new Date() }).where(eq(authUsers.id, userId)),
  ])
  return true
}

function readLoginCookie(value: string | null) {
  if (!value) return null
  try { return loginCookie.parse(JSON.parse(value)) }
  catch { return null }
}

async function linkedUserId(env: ZugoidEnv, subject: string): Promise<string | null> {
  const row = (await getDb(env.DB).select({ userId: authAccounts.userId }).from(authAccounts)
    .where(and(eq(authAccounts.providerId, PARTNER_PROVIDER), eq(authAccounts.accountId, subject))).limit(1))[0]
  return row?.userId ?? null
}

function linkStatement(env: ZugoidEnv, userId: string, subject: string) {
  const at = new Date()
  return getDb(env.DB).insert(authAccounts).values({ id: newId(), accountId: subject, providerId: PARTNER_PROVIDER, userId, createdAt: at, updatedAt: at })
}

async function memberRoleId(env: ZugoidEnv): Promise<string> {
  const role = (await getDb(env.DB).select({ id: roles.id }).from(roles).where(eq(roles.key, 'member')).limit(1))[0]
  if (!role) throw new APIError('INTERNAL_SERVER_ERROR', { message: 'Member role missing' })
  return role.id
}

async function freeHandle(env: ZugoidEnv, username: string): Promise<string | null> {
  return (await getDb(env.DB).select({ id: users.id }).from(users).where(eq(users.handle, username)).limit(1))[0] ? null : username
}

/**
 * The Account this ticket names, made or brought back as the partner says. The Server's first person must be the
 * partner's owner: they become its Owner, as the setup link would have made them.
 */
export async function admitPartnerPerson(env: ZugoidEnv, ticket: PartnerTicket, waitUntil: (promise: Promise<unknown>) => void): Promise<string> {
  const db = getDb(env.DB)
  const serverId = await getServerId(env.DB)
  const displayName = ticket.name || 'Member'
  const existing = await linkedUserId(env, ticket.sub)
  if (existing) {
    const row = (await db.select({ status: users.status, roleId: users.roleId }).from(users).where(eq(users.id, existing)).limit(1))[0]
    if (row && row.status !== 'active') {
      const now = nowIso()
      await db.update(users).set({ status: 'active', roleId: await memberRoleId(env), joinedAt: now, updatedAt: now }).where(eq(users.id, existing))
      await writeAudit(env, { serverId, actorId: existing, action: 'member.join', targetType: 'user', targetId: existing, meta: { admission: 'partner' } })
      waitUntil(signalMembersChanged(env, serverId))
    }
    return existing
  }

  const username = await generatedUsername(db, displayName)
  const userId = newId()
  const claimed = await db.select({ id: server.id }).from(server).limit(1)
  if (!claimed[0]) {
    if (ticket.role !== 'owner') throw new APIError('FORBIDDEN', { message: 'This server is not ready yet. Ask its owner to open it first.' })
    const serverName = (await readServerSetting(env.DB, 'initial_name'))?.trim() || 'Server'
    await provisionServerIn(env, { userId, username, handle: username, displayName, serverName: serverName.slice(0, 80) })
    await linkStatement(env, userId, ticket.sub)
    await env.DB.prepare('DELETE FROM server_setup WHERE singleton = 1').run()
    return userId
  }

  // Someone the partner counts among its people joins as a Member. An owner who is not this Server's Owner (the
  // partner's owner changed) joins as a Member too: the Owner is changed inside the Server, never by a ticket.
  const at = new Date()
  const created = nowIso()
  const authUser = db.insert(authUsers).values({
    id: userId,
    name: displayName,
    email: placeholderEmail(userId),
    emailVerified: false,
    username,
    displayUsername: username,
    image: null,
    createdAt: at,
    updatedAt: at,
  })
  const member = db.insert(users).values({
    id: userId,
    handle: await freeHandle(env, username),
    displayName,
    avatarR2Key: null,
    status: 'active',
    roleId: await memberRoleId(env),
    nickname: null,
    joinedAt: created,
    createdAt: created,
    updatedAt: created,
  })
  await db.batch([authUser, linkStatement(env, userId, ticket.sub), member] as unknown as Parameters<typeof db.batch>[0])
  await writeAudit(env, { serverId, actorId: userId, action: 'member.join', targetType: 'user', targetId: userId, meta: { admission: 'partner' } })
  waitUntil(signalMembersChanged(env, serverId))
  return userId
}

/** The partner took this person out: they stop being a Member, their sessions end and they leave Live rooms. */
export async function removePartnerPerson(env: ZugoidEnv, subject: string, waitUntil: (promise: Promise<unknown>) => void): Promise<'removed' | 'unknown' | 'owner'> {
  const userId = await linkedUserId(env, subject)
  if (!userId) return 'unknown'
  const db = getDb(env.DB)
  const owner = (await db.select({ ownerId: server.ownerId }).from(server).limit(1))[0]
  if (owner?.ownerId === userId) return 'owner'
  const serverId = await getServerId(env.DB)
  const now = nowIso()
  await db.update(users).set({ status: 'removed', roleId: null, nickname: null, joinedAt: null, updatedAt: now }).where(eq(users.id, userId))
  await db.delete(authSessions).where(eq(authSessions.userId, userId))
  // The partner acts for the Server's Owner, who owns the party there.
  await writeAudit(env, { serverId, actorId: owner?.ownerId ?? userId, action: 'member.kick', targetType: 'user', targetId: userId, meta: { admission: 'partner' } })
  waitUntil(signalMembersChanged(env, serverId))
  waitUntil(revalidateLiveRooms(env))
  return 'removed'
}

/** `POST /api/auth/partner/sign-in` `{ ticket }`: the ticket's person, signed in on this browser. */
export function partnerSignIn(env: ZugoidEnv, waitUntil: (promise: Promise<unknown>) => void) {
  return {
    id: 'zugoid-partner-sign-in',
    endpoints: {
      partnerStart: createAuthEndpoint(
        '/partner/start',
        { method: 'POST', body: z.object({ next: z.string().max(1024).optional() }), requireHeaders: true },
        async (ctx) => {
          const login = partnerLogin(env)
          if (!login) throw new APIError('NOT_FOUND')
          const state = crypto.randomUUID().replaceAll('-', '')
          const next = partnerDestination(ctx.body.next ?? null)
          ctx.setCookie(LOGIN_COOKIE, JSON.stringify({ state, next }), { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: LOGIN_TTL })
          return ctx.json({ url: `${login.origin}/app/?s=zugoid_${login.server}.${state}` })
        },
      ),
      partnerSignIn: createAuthEndpoint(
        '/partner/sign-in',
        { method: 'POST', body: z.object({ ticket: z.string().min(16).max(4096) }), requireHeaders: true },
        async (ctx) => {
          const ticket = await readPartnerTicket(env, ctx.body.ticket, 'sign-in')
          const login = partnerLogin(env)
          const browser = ticket?.direct ? readLoginCookie(ctx.getCookie(LOGIN_COOKIE)) : null
          if (!ticket || (ticket.direct && (!login || browser?.state !== ticket.direct.state)) || !await spendPartnerTicket(env, ticket)) {
            throw new APIError('UNAUTHORIZED', { message: 'This link is invalid or expired. Open the server again from the app.' })
          }
          const userId = await admitPartnerPerson(env, ticket, waitUntil)
          if (ticket.direct && login) {
            if (await syncPartnerProfile(env, userId, ticket.name, ticket.direct.photo, login.origin)) {
              waitUntil(signalMembersChanged(env, await getServerId(env.DB)))
            }
            ctx.setCookie(LOGIN_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 })
          }
          const user = await ctx.context.internalAdapter.findUserById(userId)
          if (!user) throw new APIError('INTERNAL_SERVER_ERROR', { message: 'Account missing' })
          const session = await ctx.context.internalAdapter.createSession(user.id)
          if (login) await markPartnerSession(env, session)
          await setSessionCookie(ctx, { user, session })
          return ctx.json({ ok: true, ...(browser ? { next: partnerDestination(browser.next) } : {}) })
        },
      ),
    },
  }
}
