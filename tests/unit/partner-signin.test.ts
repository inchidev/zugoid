import { describe, expect, it } from 'vitest'
import { readPartnerTicket } from '../../server/utils/partner-signin'

const KEY = 'a-partner-key-long-enough-for-hmac-signing'
const env = { PARTNER_SIGNIN_KEY: KEY, PUBLIC_ORIGIN: 'https://p-1.servers.example.com' }
const NOW = 1_800_000_000_000

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
const text = (value: unknown) => b64(new TextEncoder().encode(JSON.stringify(value)))

async function sign(claims: Record<string, unknown>, key = KEY, header: Record<string, unknown> = { alg: 'HS256', typ: 'JWT' }) {
  const body = `${text(header)}.${text(claims)}`
  const hmac = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return `${body}.${b64(new Uint8Array(await crypto.subtle.sign('HMAC', hmac, new TextEncoder().encode(body))))}`
}

const now = Math.floor(NOW / 1000)
const claims = (extra: Record<string, unknown> = {}) => ({
  iss: 'zugoid-platform',
  aud: env.PUBLIC_ORIGIN,
  act: 'sign-in',
  sub: '42',
  name: 'Ann',
  role: 'member',
  jti: 'ticket-0123456789abcdef',
  iat: now,
  exp: now + 60,
  ...extra,
})

describe('partner tickets', () => {
  it('reads a fresh ticket signed with this Server’s key', async () => {
    expect(await readPartnerTicket(env, await sign(claims({ role: 'owner' })), 'sign-in', NOW))
      .toEqual({ act: 'sign-in', sub: '42', name: 'Ann', role: 'owner', jti: 'ticket-0123456789abcdef', exp: now + 60 })
  })

  it('refuses another key, another Server and another act', async () => {
    expect(await readPartnerTicket(env, await sign(claims(), 'another-key-of-the-same-sort-and-length-x'), 'sign-in', NOW)).toBeNull()
    expect(await readPartnerTicket(env, await sign(claims({ aud: 'https://p-2.servers.example.com' })), 'sign-in', NOW)).toBeNull()
    expect(await readPartnerTicket(env, await sign(claims()), 'remove', NOW)).toBeNull()
  })

  it('refuses expired, future and long-lived tickets', async () => {
    expect(await readPartnerTicket(env, await sign(claims({ iat: now - 200, exp: now - 60 })), 'sign-in', NOW)).toBeNull()
    expect(await readPartnerTicket(env, await sign(claims({ iat: now + 120, exp: now + 180 })), 'sign-in', NOW)).toBeNull()
    expect(await readPartnerTicket(env, await sign(claims({ exp: now + 3600 })), 'sign-in', NOW)).toBeNull()
  })

  it('refuses other algorithms, broken tokens and Servers without a key', async () => {
    expect(await readPartnerTicket(env, await sign(claims(), KEY, { alg: 'none' }), 'sign-in', NOW)).toBeNull()
    expect(await readPartnerTicket(env, 'not.a.ticket', 'sign-in', NOW)).toBeNull()
    expect(await readPartnerTicket(env, `${await sign(claims())}.extra`, 'sign-in', NOW)).toBeNull()
    expect(await readPartnerTicket({ ...env, PARTNER_SIGNIN_KEY: 'short' }, await sign(claims(), 'short'), 'sign-in', NOW)).toBeNull()
    expect(await readPartnerTicket({ PARTNER_SIGNIN_KEY: KEY }, await sign(claims()), 'sign-in', NOW)).toBeNull()
  })

  it('refuses a ticket without the platform as issuer', async () => {
    expect(await readPartnerTicket(env, await sign(claims({ iss: 'someone' })), 'sign-in', NOW)).toBeNull()
  })

  it('authenticates the browser state and validates the avatar reference on a direct login ticket', async () => {
    const direct = { state: 'a'.repeat(32), photo: 'b'.repeat(64) }
    const token = await sign(claims({ direct }))
    expect(await readPartnerTicket(env, token, 'sign-in', NOW)).toMatchObject({ direct })
    expect(await readPartnerTicket(env, await sign(claims({ direct: { ...direct, state: 'short' } })), 'sign-in', NOW)).toBeNull()
    expect(await readPartnerTicket(env, await sign(claims({ direct: { ...direct, photo: 'https://example.com/photo' } })), 'sign-in', NOW)).toBeNull()
  })
})
