import type { ZugoidEnv } from '../../workers/env'

/**
 * Some runtimes pick the Worker by Host (open-compute: `<worker>.<account>.localhost`), so the proxy in front of them
 * rewrites the Host. A request that arrives with exactly `ZUGOID_INTERNAL_HOST` is that proxy's request for
 * `PUBLIC_ORIGIN`, and is served as one: sign-in, the origin check and every link see the Server's own address.
 * No forwarded header is trusted, and any other Host is left as it came.
 */
export function servedRequest(request: Request, env: Pick<ZugoidEnv, 'ZUGOID_INTERNAL_HOST' | 'PUBLIC_ORIGIN'>): Request {
  const internal = env.ZUGOID_INTERNAL_HOST?.trim().toLowerCase()
  if (!internal || !env.PUBLIC_ORIGIN) return request
  const url = new URL(request.url)
  if (url.host.toLowerCase() !== internal) return request
  const origin = new URL(env.PUBLIC_ORIGIN)
  const served = new URL(`${url.pathname}${url.search}`, origin.origin)
  const headers = new Headers(request.headers)
  headers.set('host', origin.host)
  // How Nitro learns the scheme; the proxy's own header may not survive the runtime.
  headers.set('x-forwarded-proto', origin.protocol.slice(0, -1))
  return new Request(served, { method: request.method, headers, body: request.body, redirect: request.redirect, ...(request.body ? { duplex: 'half' } : {}) } as RequestInit)
}
