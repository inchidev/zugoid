import { describe, expect, it } from 'vitest'
import { servedRequest } from '../../server/utils/internal-host'

const env = { ZUGOID_INTERNAL_HOST: 'p-1.acct.localhost:8787', PUBLIC_ORIGIN: 'https://p-1.servers.example.com' }

describe('the internal Host', () => {
  it('serves the proxy’s request as the public origin', async () => {
    const request = servedRequest(new Request('http://p-1.acct.localhost:8787/api/x?y=1', { method: 'POST', headers: { host: 'p-1.acct.localhost:8787', origin: 'https://p-1.servers.example.com' }, body: '{"a":1}' }), env)
    expect(request.url).toBe('https://p-1.servers.example.com/api/x?y=1')
    expect(request.headers.get('host')).toBe('p-1.servers.example.com')
    expect(request.headers.get('x-forwarded-proto')).toBe('https')
    expect(request.headers.get('origin')).toBe('https://p-1.servers.example.com')
    expect(request.method).toBe('POST')
    expect(await request.text()).toBe('{"a":1}')
  })

  it('leaves every other Host, and Servers without the setting, as they came', () => {
    const other = new Request('http://p-2.acct.localhost:8787/')
    expect(servedRequest(other, env)).toBe(other)
    const same = new Request('http://p-1.acct.localhost:8787/')
    expect(servedRequest(same, { PUBLIC_ORIGIN: env.PUBLIC_ORIGIN })).toBe(same)
  })
})
