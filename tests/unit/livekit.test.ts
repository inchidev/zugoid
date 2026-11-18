import { describe, expect, it } from 'vitest'
import { liveKitHttpUrl, liveKitIdentity, liveKitRooms, liveKitToken, liveKitUserId, normalizeLiveKitUrl, testLiveKit, type LiveKitConfig } from '../../workers/livekit'

const config: LiveKitConfig = { url: 'wss://live.example.com', apiKey: 'APIkey', apiSecret: 'a-secret-long-enough-for-hmac-signing', source: 'database' }
const SERVER = '6f1c2e8a-1d2b-4c3d-8e4f-5a6b7c8d9e0f'

function decode(token: string) {
  const [header, payload] = token.split('.')
  const json = (part: string) => JSON.parse(atob(part.replaceAll('-', '+').replaceAll('_', '/')))
  return { header: json(header!), payload: json(payload!) }
}

async function verifies(token: string, secret: string) {
  const [header, payload, signature] = token.split('.')
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  const bytes = Uint8Array.from(atob(signature!.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0))
  return crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(`${header}.${payload}`))
}

type Call = { url: string, auth: string, body: Record<string, unknown> }
function fakeLiveKit(answer: (method: string, body: Record<string, unknown>) => { status: number, body?: unknown } = () => ({ status: 200, body: {} })) {
  const calls: Call[] = []
  const transport = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
    calls.push({ url, auth: new Headers(init?.headers).get('authorization') ?? '', body })
    const result = answer(url.split('/').at(-1)!, body)
    return new Response(result.body === undefined ? '' : JSON.stringify(result.body), { status: result.status })
  }) as typeof fetch
  return { calls, transport }
}

describe('LiveKit addresses', () => {
  it('accepts wss and https forms and drops a trailing slash', () => {
    expect(normalizeLiveKitUrl('wss://live.example.com/')).toBe('wss://live.example.com')
    expect(normalizeLiveKitUrl(' https://live.example.com:7880 ')).toBe('wss://live.example.com:7880')
    expect(normalizeLiveKitUrl('ws://127.0.0.1:7880')).toBe('ws://127.0.0.1:7880')
  })

  it('refuses other schemes, credentials and queries', () => {
    expect(normalizeLiveKitUrl('ftp://live.example.com')).toBeNull()
    expect(normalizeLiveKitUrl('wss://user:pass@live.example.com')).toBeNull()
    expect(normalizeLiveKitUrl('wss://live.example.com/?token=x')).toBeNull()
    expect(normalizeLiveKitUrl('not a url')).toBeNull()
  })

  it('reaches the room API over HTTP on the same host', () => {
    expect(liveKitHttpUrl('wss://live.example.com')).toBe('https://live.example.com')
    expect(liveKitHttpUrl('ws://127.0.0.1:7880')).toBe('http://127.0.0.1:7880')
  })
})

describe('LiveKit tokens', () => {
  it('signs HS256 with the API secret and carries the grant', async () => {
    const token = await liveKitToken(config, { identity: 'u1.abcd', name: 'Ann', video: { room: 'r', roomJoin: true }, ttlSeconds: 60 }, 1_000)
    const { header, payload } = decode(token)
    expect(header).toEqual({ alg: 'HS256', typ: 'JWT' })
    expect(payload).toMatchObject({ iss: 'APIkey', sub: 'u1.abcd', name: 'Ann', nbf: 990, exp: 1_060, video: { room: 'r', roomJoin: true } })
    expect(await verifies(token, config.apiSecret)).toBe(true)
    expect(await verifies(token, 'another-secret-of-the-same-length-xx')).toBe(false)
  })

  it('gives every seat its own identity that still names the Member', () => {
    const a = liveKitIdentity('user-1')
    const b = liveKitIdentity('user-1')
    expect(a).not.toBe(b)
    expect(liveKitUserId(a)).toBe('user-1')
  })
})

describe('LiveKit rooms', () => {
  it('creates rooms named after this Server with a create-only grant', async () => {
    const { calls, transport } = fakeLiveKit()
    const room = await liveKitRooms(config, SERVER, transport).createRoom()
    expect(room.id.startsWith(`zugoid-${SERVER}-`)).toBe(true)
    expect(calls[0]!.url).toBe('https://live.example.com/twirp/livekit.RoomService/CreateRoom')
    expect(calls[0]!.body).toMatchObject({ name: room.id })
    const { payload } = decode(calls[0]!.auth.replace('Bearer ', ''))
    expect(payload.video).toEqual({ roomCreate: true })
  })

  it('seats a participant in one room only, with the Member in metadata', async () => {
    const { calls, transport } = fakeLiveKit()
    const seat = await liveKitRooms(config, SERVER, transport).addParticipant('room-1', { name: 'Ann', customId: 'user-1', host: true })
    expect(calls).toHaveLength(0)
    expect(liveKitUserId(seat.id)).toBe('user-1')
    const { payload } = decode(seat.token)
    expect(payload.sub).toBe(seat.id)
    expect(payload.video).toMatchObject({ room: 'room-1', roomJoin: true, canPublish: true, canSubscribe: true })
    expect(payload.video.roomAdmin).toBeUndefined()
    expect(JSON.parse(payload.metadata)).toEqual({ userId: 'user-1', host: true })
  })

  it('treats someone who already left as removed', async () => {
    const { calls, transport } = fakeLiveKit(() => ({ status: 404, body: { code: 'not_found' } }))
    await expect(liveKitRooms(config, SERVER, transport).removeParticipants('room-1', ['a.1', 'b.2'])).resolves.toBeUndefined()
    expect(calls.map(call => call.body)).toEqual(expect.arrayContaining([{ room: 'room-1', identity: 'a.1' }, { room: 'room-1', identity: 'b.2' }]))
    expect(calls).toHaveLength(2)
  })

  it('still reports other failures', async () => {
    const { transport } = fakeLiveKit(() => ({ status: 500 }))
    await expect(liveKitRooms(config, SERVER, transport).removeParticipants('room-1', ['a.1'])).rejects.toThrow('RemoveParticipant')
  })

  it('mutes only the microphone tracks that are on', async () => {
    const { calls, transport } = fakeLiveKit(method => method === 'GetParticipant'
      ? { status: 200, body: { participant: { tracks: [{ sid: 'TR_a', type: 'AUDIO' }, { sid: 'TR_v', type: 'VIDEO' }, { sid: 'TR_m', type: 'AUDIO', muted: true }] } } }
      : { status: 200, body: {} })
    await liveKitRooms(config, SERVER, transport).muteParticipant('room-1', 'a.1')
    const mutes = calls.filter(call => call.url.endsWith('MutePublishedTrack')).map(call => call.body)
    expect(mutes).toEqual([{ room: 'room-1', identity: 'a.1', trackSid: 'TR_a', muted: true }])
  })
})

describe('LiveKit connection test', () => {
  it('says when the key or secret is refused', async () => {
    const { transport } = fakeLiveKit(() => ({ status: 401 }))
    expect(await testLiveKit(config, transport)).toEqual({ ok: false, message: 'LiveKit refused this API key and secret.' })
  })

  it('passes when rooms can be listed', async () => {
    const { calls, transport } = fakeLiveKit(() => ({ status: 200, body: { rooms: [] } }))
    expect(await testLiveKit(config, transport)).toEqual({ ok: true })
    expect(calls[0]!.url.endsWith('ListRooms')).toBe(true)
  })
})
