import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ids, mcpFixture } from '../helpers/outbound-mcp'
import { integrationsStatus } from '../../server/utils/integrations'
import { beginThreadsConnection, completeThreadsConnection, disconnectThreads, loadThreadsConnection } from '../../server/utils/threads-connection'

const origin = 'https://zugoid.example'
const owner = { userId: ids.owner, serverId: ids.server }
const app = { appId: '87654321', appSecret: 'synthetic-app-secret' }
let f: ReturnType<typeof mcpFixture>

beforeEach(() => { f = mcpFixture() })
afterEach(() => { vi.restoreAllMocks(); f.db.close() })

async function authorize() {
  const authorization = new URL(await beginThreadsConnection(f.env, owner, origin, app))
  const callback = new URL(authorization.searchParams.get('redirect_uri')!)
  callback.searchParams.set('state', authorization.searchParams.get('state')!)
  callback.searchParams.set('code', 'synthetic-code')
  return { authorization, callback }
}

it('exchanges an Owner-bound authorization once and exposes only connection status', async () => {
  const { authorization, callback } = await authorize()
  expect(authorization.origin + authorization.pathname).toBe('https://threads.com/oauth/authorize')
  expect(authorization.searchParams.get('scope')).toBe('threads_basic,threads_keyword_search')
  expect(authorization.searchParams.get('client_id')).toBe(app.appId)
  expect(authorization.href).not.toContain(app.appSecret)

  const transport = vi.spyOn(globalThis, 'fetch')
    .mockImplementationOnce(async (request, init) => {
      expect(String(request)).toBe('https://graph.threads.com/oauth/access_token')
      expect(init).toMatchObject({ method: 'POST', redirect: 'manual' })
      const form = init?.body as FormData
      expect(Object.fromEntries(form)).toEqual({
        client_id: app.appId, client_secret: app.appSecret, code: 'synthetic-code',
        grant_type: 'authorization_code', redirect_uri: callback.origin + callback.pathname,
      })
      return Response.json({ access_token: 'synthetic-short-token' })
    })
    .mockImplementationOnce(async (request, init) => {
      const url = new URL(String(request))
      expect(url.origin + url.pathname).toBe('https://graph.threads.com/access_token')
      expect(Object.fromEntries(url.searchParams)).toEqual({
        grant_type: 'th_exchange_token', client_secret: app.appSecret, access_token: 'synthetic-short-token',
      })
      expect(init?.redirect).toBe('manual')
      return Response.json({ access_token: 'synthetic-long-token', expires_in: 5184000 })
    })

  const wrongOrigin = new URL(callback)
  wrongOrigin.hostname = 'alias.zugoid.example'
  await expect(completeThreadsConnection(f.env, owner, wrongOrigin)).resolves.toBe('expired')
  await expect(completeThreadsConnection(f.env, { ...owner, userId: ids.member }, callback)).resolves.toBe('expired')
  expect(transport).not.toHaveBeenCalled()

  const outcomes = await Promise.all([completeThreadsConnection(f.env, owner, callback), completeThreadsConnection(f.env, owner, callback)])
  expect(outcomes.sort()).toEqual(['connected', 'expired'])
  expect(transport).toHaveBeenCalledTimes(2)

  const connection = await loadThreadsConnection(f.env)
  expect(connection).toMatchObject({ token: 'synthetic-long-token' })
  expect(JSON.stringify(f.db.prepare("SELECT value FROM server_settings WHERE key LIKE 'threads.oauth.%'").all())).not.toContain('synthetic-')
  const { threads } = await integrationsStatus(f.env, owner.userId, origin)
  expect(threads).toEqual({ callbackUrl: callback.origin + callback.pathname, expiresAt: new Date(connection!.expiresAt).toISOString(), expired: false })

  await disconnectThreads(f.env)
  expect(await loadThreadsConnection(f.env)).toBeNull()
})

it('does not restore the connection if the Owner disconnects during the token exchange', async () => {
  const { callback } = await authorize()
  const transport = vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(Response.json({ access_token: 'synthetic-short-token' }))
    .mockImplementationOnce(async () => {
      await disconnectThreads(f.env)
      return Response.json({ access_token: 'synthetic-long-token', expires_in: 5184000 })
    })
  await expect(completeThreadsConnection(f.env, owner, callback)).resolves.toBe('expired')
  expect(transport).toHaveBeenCalledTimes(2)
  expect(await loadThreadsConnection(f.env)).toBeNull()
})

it('returns a safe failure and retires the state when Meta times out or rejects the exchange', async () => {
  const { callback } = await authorize()
  const transport = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('upstream diagnostics with secret'))
  await expect(completeThreadsConnection(f.env, owner, callback)).resolves.toBe('failed')
  await expect(completeThreadsConnection(f.env, owner, callback)).resolves.toBe('expired')
  expect(transport).toHaveBeenCalledTimes(1)
})
