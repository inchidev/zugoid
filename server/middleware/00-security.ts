import { SERVER_PERMISSIONS_POLICY, strictTransportSecurity } from '../../shared/security-headers'
import { cf, fail, originOk } from '../utils/cf'
import { primaryServerOrigin } from '../utils/server-origins'
import { frameAncestorsFor } from '../../shared/server-embedding'
import { fetchMetadataExempt, OAUTH_BACKCHANNEL_PATHS, serverContentSecurityPolicy } from '../utils/security-policy'
import { embedOrigins } from '../utils/server-theme'

export default defineEventHandler(async (event) => {
  const path = (event.path || '').split('?')[0]!
  if (path.startsWith('/ws/')) return

  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  setHeader(event, 'Referrer-Policy', 'strict-origin-when-cross-origin')
  setHeader(event, 'Permissions-Policy', SERVER_PERMISSIONS_POLICY)
  // Operator-owned origins: no includeSubDomains, so a Server on an apex name
  // never forces HTTPS onto the operator's unrelated subdomains.
  const hsts = strictTransportSecurity(getRequestURL(event), getHeader(event, 'x-forwarded-proto'), false)
  if (hsts) setHeader(event, 'Strict-Transport-Security', hsts)
  // The MCP consent page is never framed. Elsewhere the Owner may name sites that frame the Client.
  const frameAncestors = path === '/mcp/authorize' ? "'none'" : frameAncestorsFor(await ownerEmbedOrigins(event))
  setHeader(event, 'Content-Security-Policy', serverContentSecurityPolicy(frameAncestors))

  const oauthBackchannel = OAUTH_BACKCHANNEL_PATHS.has(path)
  if (oauthBackchannel) {
    setHeader(event, 'Access-Control-Allow-Origin', '*')
    setHeader(event, 'Cache-Control', 'no-store')
    if (event.method === 'OPTIONS') {
      setHeader(event, 'Access-Control-Allow-Methods', 'POST, OPTIONS')
      setHeader(event, 'Access-Control-Allow-Headers', 'Content-Type, Authorization')
      setResponseStatus(event, 204)
      return ''
    }
    // Cross-origin token clients (browser MCP clients) are authenticated by
    // client credentials/PKCE, so the Origin check does not apply here.
    return
  }
  const allowMissingFetchMetadata = fetchMetadataExempt(path, getHeader(event, 'authorization'))
  if (!await originOk(event, { allowMissingFetchMetadata })) {
    fail(403, 'csrf', await mismatchMessage(event))
  }
})

/** The Owner's sites that may frame the Client; none when the bindings or the setting are unreadable. */
async function ownerEmbedOrigins(event: Parameters<typeof cf>[0]): Promise<string[]> {
  try { return await embedOrigins(cf(event).env.DB) }
  catch { return [] }
}

/** Name the addresses involved so an operator can see which setting to fix. */
async function mismatchMessage(event: Parameters<typeof originOk>[0]): Promise<string> {
  const received = getRequestURL(event).origin
  let page = received
  try { page = new URL(getHeader(event, 'origin') || received).origin } catch { /* Keep the request URL. */ }
  let expected = ''
  try { expected = await primaryServerOrigin(cf(event).env) } catch { /* Prerender has no runtime bindings. */ }
  if (!expected) return 'Origin mismatch'
  if (page !== expected) {
    return `Origin mismatch: this page is ${page}, but the Server's address is ${expected}. Open the Server at its address, or list this one as an alias (ZUGOID_ORIGINS).`
  }
  if (received !== expected) {
    // The browser is right; the reverse proxy forwarded another Host or scheme.
    return `Origin mismatch: the Server received this request as ${received}, not ${expected}. The reverse proxy must forward the original Host and X-Forwarded-Proto.`
  }
  return 'Origin mismatch'
}
