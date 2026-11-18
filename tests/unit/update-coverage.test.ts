import { expect, it, vi } from 'vitest'
import { updateCoverage } from '../../server/utils/update-coverage'

const SERVER = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b'
const answer = (body: unknown, status = 200) => vi.fn(async () => Response.json(body, { status })) as unknown as typeof fetch

it('asks zugoid.com about this Server by its UUID alone, and adds its address to the subscribe link', async () => {
  const fetcher = answer({ serverId: SERVER, covered: false, reason: 'none', freeUntil: '2026-11-01T00:00:00.000Z', message: 'No release.', subscribeUrl: `https://zugoid.com/billing/checkout?server=${SERVER}` })
  const coverage = await updateCoverage({}, SERVER, 'https://team.example.com', fetcher)
  expect(fetcher).toHaveBeenCalledWith(`https://zugoid.com/api/servers/${SERVER}/coverage`, expect.objectContaining({ headers: expect.not.objectContaining({ Cookie: expect.anything() }) }))
  expect(coverage).toEqual({ covered: false, reason: 'none', freeUntil: '2026-11-01T00:00:00.000Z', message: 'No release.', subscribeUrl: `https://zugoid.com/billing/checkout?server=${SERVER}&origin=https%3A%2F%2Fteam.example.com` })
})

it('holds nothing back when zugoid.com cannot say', async () => {
  expect(await updateCoverage({}, SERVER, 'https://team.example.com', answer({ error: 'down' }, 503))).toMatchObject({ covered: true, reason: 'unknown' })
  expect(await updateCoverage({}, SERVER, 'https://team.example.com', vi.fn(async () => { throw new Error('offline') }) as unknown as typeof fetch)).toMatchObject({ covered: true, reason: 'unknown' })
  expect(await updateCoverage({}, SERVER, 'https://team.example.com', answer({ nonsense: true }))).toMatchObject({ covered: true, reason: 'unknown' })
})

it('never asks for a partner\'s Server, whose platform delivers its releases, and never follows a link elsewhere', async () => {
  const fetcher = answer({})
  expect(await updateCoverage({ PARTNER_SIGNIN_KEY: 'k'.repeat(43) }, SERVER, 'https://team.example.com', fetcher)).toMatchObject({ covered: true, reason: 'partner' })
  expect(fetcher).not.toHaveBeenCalled()
  const elsewhere = answer({ covered: false, reason: 'none', freeUntil: null, message: 'x', subscribeUrl: 'https://evil.example/pay' })
  expect((await updateCoverage({}, SERVER, 'https://team.example.com', elsewhere)).subscribeUrl).toBeNull()
})
