import { decryptSecret, encryptSecret, type EncryptedSecret } from '../shared/encrypted-secret'
import { readServerSetting, writeServerSetting } from '../shared/server-settings'
import type { LiveKitSettingsAdminDTO } from '../shared/types'
import { authSecret } from '../server/utils/auth-config'
import type { ZugoidEnv } from './env'

/**
 * LiveKit, the other media plane for Live next to RealtimeKit: a LiveKit the operator runs (on a VPS, next to
 * the Server) or LiveKit Cloud. The Server signs each participant's token itself with the API secret and
 * manages rooms through LiveKit's Twirp API. The secret never leaves the Server.
 */
export type LiveKitConfig = { url: string, apiKey: string, apiSecret: string, source: 'deployment' | 'database' }

const SETTING = 'calls.livekit'
const SCOPE = 'livekit-api-secret'
type Stored = { url: string, apiKey: string, secret: EncryptedSecret }

/** A LiveKit address as the client dials it: `wss://host[:port][/path]`, no query or credentials. */
export function normalizeLiveKitUrl(value: string): string | null {
  let url: URL
  try { url = new URL(value.trim().replace(/^https:/u, 'wss:').replace(/^http:/u, 'ws:')) }
  catch { return null }
  if (url.protocol !== 'wss:' && url.protocol !== 'ws:') return null
  if (url.username || url.password || url.search || url.hash) return null
  return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/u, '')}`
}

/** The same server over HTTP, for the room API. */
export function liveKitHttpUrl(url: string): string {
  return url.replace(/^wss:/u, 'https:').replace(/^ws:/u, 'http:')
}

/**
 * Deployment variables win when all three are set; otherwise what the Owner saved in Server settings.
 * Null when LiveKit is not set up or its saved secret no longer opens with this Server's key.
 */
export async function loadLiveKitConfig(env: ZugoidEnv): Promise<LiveKitConfig | null> {
  const url = normalizeLiveKitUrl(env.LIVEKIT_URL ?? '')
  const apiKey = env.LIVEKIT_API_KEY?.trim()
  const apiSecret = env.LIVEKIT_API_SECRET?.trim()
  if (url && apiKey && apiSecret) return { url, apiKey, apiSecret, source: 'deployment' }
  const stored = await readStored(env)
  if (!stored) return null
  try {
    return { url: stored.url, apiKey: stored.apiKey, apiSecret: await decryptSecret(authSecret(env), SCOPE, stored.secret), source: 'database' }
  }
  catch { return null }
}

async function readStored(env: ZugoidEnv): Promise<Stored | null> {
  let value: string | null
  try { value = await readServerSetting(env.DB, SETTING) }
  catch { return null }
  if (!value) return null
  try { return JSON.parse(value) as Stored }
  catch { return null }
}

export async function saveLiveKitConfig(env: ZugoidEnv, input: { url: string, apiKey: string, apiSecret?: string | null }): Promise<void> {
  const url = normalizeLiveKitUrl(input.url)
  if (!url) throw new Error('LiveKit URL must start with wss://')
  let secret: EncryptedSecret
  if (input.apiSecret) secret = await encryptSecret(authSecret(env), SCOPE, input.apiSecret)
  else {
    const stored = await readStored(env)
    if (!stored) throw new Error('LiveKit API secret is required')
    secret = stored.secret
  }
  await writeServerSetting(env.DB, SETTING, JSON.stringify({ url, apiKey: input.apiKey.trim(), secret } satisfies Stored))
}

export async function deleteLiveKitConfig(env: ZugoidEnv): Promise<void> {
  await env.DB.prepare('DELETE FROM server_settings WHERE key = ?').bind(SETTING).run()
}

export async function liveKitSettingsAdminDto(env: ZugoidEnv): Promise<LiveKitSettingsAdminDTO> {
  const config = await loadLiveKitConfig(env)
  const stored = config ? null : await readStored(env)
  return {
    configured: Boolean(config),
    source: config?.source ?? (stored ? 'database' : 'missing'),
    url: config?.url ?? stored?.url ?? null,
    apiKey: config?.apiKey ?? stored?.apiKey ?? null,
    secretReadable: Boolean(config) || !stored,
  }
}

const encoder = new TextEncoder()
const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')

type VideoGrant = {
  room?: string
  roomJoin?: boolean
  roomCreate?: boolean
  roomAdmin?: boolean
  roomList?: boolean
  canPublish?: boolean
  canSubscribe?: boolean
  canPublishData?: boolean
  canPublishSources?: string[]
}

/** A LiveKit access token: HS256 over the API secret, as LiveKit's own SDKs make it. */
export async function liveKitToken(config: Pick<LiveKitConfig, 'apiKey' | 'apiSecret'>, claims: { identity?: string, name?: string, metadata?: string, video: VideoGrant, ttlSeconds: number }, now = Math.floor(Date.now() / 1000)): Promise<string> {
  const header = base64url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const payload = base64url(encoder.encode(JSON.stringify({
    iss: config.apiKey,
    nbf: now - 10,
    exp: now + claims.ttlSeconds,
    ...(claims.identity ? { sub: claims.identity, jti: claims.identity } : {}),
    ...(claims.name ? { name: claims.name } : {}),
    ...(claims.metadata ? { metadata: claims.metadata } : {}),
    video: claims.video,
  })))
  const key = await crypto.subtle.importKey('raw', encoder.encode(config.apiSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`${header}.${payload}`)))
  return `${header}.${payload}.${base64url(signature)}`
}

export class LiveKitHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

type Transport = typeof fetch

/** One call to LiveKit's RoomService. */
async function roomService<T>(config: LiveKitConfig, method: string, body: Record<string, unknown>, grant: VideoGrant, transport: Transport = fetch): Promise<T> {
  const token = await liveKitToken(config, { video: grant, ttlSeconds: 600 })
  const response = await transport(`${liveKitHttpUrl(config.url)}/twirp/livekit.RoomService/${method}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  })
  const text = await response.text()
  if (!response.ok) throw new LiveKitHttpError(response.status, `LiveKit ${method} failed (${response.status})`)
  return (text ? JSON.parse(text) : {}) as T
}

/** A participant's identity in a room: the Member's id and this seat, so a newer seat is never taken for an older one. */
export function liveKitIdentity(userId: string): string {
  return `${userId}.${crypto.randomUUID().slice(0, 8)}`
}

/** The Member an identity belongs to. */
export function liveKitUserId(identity: string): string {
  return identity.split('.')[0] ?? identity
}

/** Rooms close a while after the last person left, so a dropped connection can come back. */
const EMPTY_TIMEOUT_SECONDS = 10 * 60
/** A participant token outlives any one connection; LiveKit refreshes the session itself while connected. */
const PARTICIPANT_TTL_SECONDS = 6 * 60 * 60

export function liveKitRooms(config: LiveKitConfig, serverId: string, transport: Transport = fetch) {
  return {
    async createRoom(): Promise<{ id: string }> {
      // One LiveKit may serve several Servers and products, so every room name starts with this Server.
      const name = `zugoid-${serverId}-${crypto.randomUUID()}`
      await roomService(config, 'CreateRoom', { name, emptyTimeout: EMPTY_TIMEOUT_SECONDS }, { roomCreate: true }, transport)
      return { id: name }
    },
    async addParticipant(room: string, seat: { name: string, customId: string, host: boolean }): Promise<{ id: string, token: string }> {
      const identity = liveKitIdentity(seat.customId)
      const token = await liveKitToken(config, {
        identity,
        name: seat.name,
        metadata: JSON.stringify({ userId: seat.customId, host: seat.host }),
        video: { room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true },
        ttlSeconds: PARTICIPANT_TTL_SECONDS,
      })
      return { id: identity, token }
    },
    async removeParticipants(room: string, identities: string[]): Promise<void> {
      await Promise.all(identities.map(identity => roomService(config, 'RemoveParticipant', { room, identity }, { room, roomAdmin: true }, transport)
        .catch((error) => {
          // Someone who already left is gone either way.
          if (!(error instanceof LiveKitHttpError && error.status === 404)) throw error
        })))
    },
    async endRoom(room: string): Promise<void> {
      await roomService(config, 'DeleteRoom', { room }, { room, roomCreate: true }, transport).catch((error) => {
        if (!(error instanceof LiveKitHttpError && error.status === 404)) throw error
      })
    },
    /** Turn off someone's microphone. They can turn it back on themselves. */
    async muteParticipant(room: string, identity: string): Promise<void> {
      const { participant } = await roomService<{ participant?: { tracks?: Array<{ sid?: string, type?: string | number, source?: string | number, muted?: boolean }> } }>(
        config, 'GetParticipant', { room, identity }, { room, roomAdmin: true }, transport,
      )
      const audio = (participant?.tracks ?? []).filter(track => (track.type === 'AUDIO' || track.type === 0) && !track.muted && track.sid)
      await Promise.all(audio.map(track => roomService(config, 'MutePublishedTrack', { room, identity, trackSid: track.sid, muted: true }, { room, roomAdmin: true }, transport)))
    },
  }
}

/** Whether these credentials reach a LiveKit: list rooms, which needs a valid key and secret. */
export async function testLiveKit(config: LiveKitConfig, transport: Transport = fetch): Promise<{ ok: true } | { ok: false, message: string }> {
  try {
    await roomService(config, 'ListRooms', {}, { roomList: true }, transport)
    return { ok: true }
  }
  catch (error) {
    if (error instanceof LiveKitHttpError && (error.status === 401 || error.status === 403)) return { ok: false, message: 'LiveKit refused this API key and secret.' }
    if (error instanceof LiveKitHttpError) return { ok: false, message: `LiveKit answered ${error.status}. Check the URL.` }
    return { ok: false, message: 'LiveKit could not be reached at this URL.' }
  }
}
