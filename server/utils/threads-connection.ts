import { z } from 'zod'
import { decryptSecret, encryptSecret, type EncryptedSecret } from '../../shared/encrypted-secret'
import { newId, nowIso } from '../../shared/ids'
import { readServerSetting, sha256Hex, writeServerSetting } from '../../shared/server-settings'
import type { ZugoidEnv } from '../../workers/env'
import { fail } from './cf'
import { threadsRequest } from './threads-api'

const pendingKey = 'threads.oauth.pending'
const connectionKey = 'threads.oauth.connection'
const stateLifetimeMs = 10 * 60 * 1000
const scope = 'threads_basic,threads_keyword_search'

export const threadsAppInput = z.object({
  appId: z.string().trim().regex(/^\d{1,32}$/u, 'Enter the numeric Threads App ID'),
  appSecret: z.string().trim().min(8).max(256),
}).strict()

const pendingSchema = threadsAppInput.extend({
  ownerId: z.string(),
  stateHash: z.string(),
  redirectUri: z.url(),
  expiresAt: z.number(),
})
const connectionSchema = z.object({ token: z.string().min(1).max(4096), expiresAt: z.number() })
const tokenSchema = z.object({ access_token: connectionSchema.shape.token })
const longTokenSchema = tokenSchema.extend({ expires_in: z.number().int().positive().max(60 * 24 * 60 * 60) })

type OAuthOwner = { serverId: string; userId: string }

export function threadsCallbackUrl(origin: string, serverId: string) {
  return `${origin}/api/servers/${serverId}/integrations/threads/callback`
}

async function seal(env: ZugoidEnv, key: string, data: unknown) {
  if (!env.AUTH_SECRET) fail(503, 'threads_encryption', 'Server credential encryption is unavailable')
  return JSON.stringify(await encryptSecret(env.AUTH_SECRET, key, JSON.stringify(data)))
}

async function unseal<T>(env: ZugoidEnv, key: string, value: string | null, schema: z.ZodType<T>) {
  if (!env.AUTH_SECRET || !value) return null
  try {
    const json = await decryptSecret(env.AUTH_SECRET, key, JSON.parse(value) as EncryptedSecret)
    return schema.safeParse(JSON.parse(json)).data ?? null
  } catch { return null }
}

export async function loadThreadsConnection(env: ZugoidEnv) {
  return unseal(env, connectionKey, await readServerSetting(env.DB, connectionKey), connectionSchema)
}

export async function beginThreadsConnection(env: ZugoidEnv, owner: OAuthOwner, origin: string, app: z.output<typeof threadsAppInput>) {
  if (new URL(origin).protocol !== 'https:') fail(400, 'threads_https_required', 'Open this Server over HTTPS to connect Threads')
  const state = crypto.randomUUID()
  const redirectUri = threadsCallbackUrl(origin, owner.serverId)
  const pending = { ...app, ownerId: owner.userId, stateHash: await sha256Hex(state), redirectUri, expiresAt: Date.now() + stateLifetimeMs }
  await writeServerSetting(env.DB, pendingKey, await seal(env, pendingKey, pending))
  const url = new URL('https://threads.com/oauth/authorize')
  url.search = new URLSearchParams({ client_id: app.appId, redirect_uri: redirectUri, scope, response_type: 'code', state }).toString()
  return url.href
}

export async function completeThreadsConnection(env: ZugoidEnv, owner: OAuthOwner, callback: URL) {
  const state = callback.searchParams.get('state')
  if (!state || state.length > 64) return 'expired'
  const stored = await readServerSetting(env.DB, pendingKey)
  const pending = await unseal(env, pendingKey, stored, pendingSchema)
  if (!pending || pending.ownerId !== owner.userId || pending.expiresAt <= Date.now()
    || pending.redirectUri !== callback.origin + callback.pathname
    || pending.redirectUri !== threadsCallbackUrl(callback.origin, owner.serverId)
    || pending.stateHash !== await sha256Hex(state)) return 'expired'

  // Claim the callback once. Reconnect or disconnect can supersede the claim during either exchange.
  const claim = newId()
  const claimed = await env.DB.prepare('UPDATE server_settings SET value=?, updated_at=? WHERE key=? AND value=? RETURNING key')
    .bind(claim, nowIso(), pendingKey, stored).first()
  if (!claimed) return 'expired'
  try {
    const code = callback.searchParams.get('code')
    if (callback.searchParams.has('error') || !code || code.length > 4096) return 'declined'
    const form = new FormData()
    form.set('client_id', pending.appId)
    form.set('client_secret', pending.appSecret)
    form.set('code', code)
    form.set('grant_type', 'authorization_code')
    form.set('redirect_uri', pending.redirectUri)
    const short = await threadsRequest('/oauth/access_token', new URLSearchParams(), {
      method: 'POST', body: form, signal: AbortSignal.timeout(12000),
    }).catch(() => null)
    const shortToken = tokenSchema.safeParse(short?.data).data
    if (!short?.ok || !shortToken) return 'failed'

    const long = await threadsRequest('/access_token', new URLSearchParams({
      grant_type: 'th_exchange_token', client_secret: pending.appSecret, access_token: shortToken.access_token,
    }), { signal: AbortSignal.timeout(12000) }).catch(() => null)
    const longToken = longTokenSchema.safeParse(long?.data).data
    if (!long?.ok || !longToken) return 'failed'

    const value = await seal(env, connectionKey, { token: longToken.access_token, expiresAt: Date.now() + longToken.expires_in * 1000 })
    const saved = await env.DB.prepare(
      `INSERT INTO server_settings(key,value,updated_at)
       SELECT ?,?,? FROM server_settings WHERE key=? AND value=?
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at RETURNING key`,
    ).bind(connectionKey, value, nowIso(), pendingKey, claim).first()
    return saved ? 'connected' : 'expired'
  } finally {
    await env.DB.prepare('DELETE FROM server_settings WHERE key=? AND value=?').bind(pendingKey, claim).run()
  }
}

export async function disconnectThreads(env: ZugoidEnv) {
  await env.DB.prepare('DELETE FROM server_settings WHERE key IN (?,?)').bind(connectionKey, pendingKey).run()
}
