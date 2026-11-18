import { z } from 'zod'

/**
 * The sites that may show this Server's Client in a frame, chosen by the Owner in Server
 * settings → Appearance. Empty, the default, keeps `frame-ancestors 'self'`. Kept in
 * `server_settings` under {@link SERVER_EMBED_KEY}.
 *
 * Signing in inside a frame needs the Server on a subdomain of the embedding site
 * (`chat.example.com` inside `example.com`): the frame is then same-site and the session
 * cookie (`SameSite=Lax`) is sent. A frame on an unrelated site gets no cookie.
 */
export const SERVER_EMBED_KEY = 'embed.origins'
export const MAX_EMBED_ORIGINS = 10

/** One `https://host[:port]` origin, exactly: no path, wildcard, credentials or plain http. */
export function embedOrigin(value: string): string | null {
  const text = value.trim()
  if (!text || text.length > 255 || text.includes('*')) return null
  try {
    const url = new URL(text)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null
    if (url.pathname !== '/' && url.pathname !== '') return null
    if (!/^[a-z0-9.-]+$/u.test(url.hostname) || !url.hostname.includes('.')) return null
    return url.origin
  }
  catch { return null }
}

export const serverEmbeddingSchema = z.object({
  origins: z.array(z.string()).max(MAX_EMBED_ORIGINS, `At most ${MAX_EMBED_ORIGINS} sites`).transform((values, context) => {
    const origins: string[] = []
    for (const value of values) {
      const origin = embedOrigin(value)
      if (!origin) {
        context.addIssue({ code: 'custom', message: `${value.trim() || 'An empty address'} is not a site address like https://example.com` })
        return z.NEVER
      }
      if (!origins.includes(origin)) origins.push(origin)
    }
    return origins
  }),
}).strict()

export type ServerEmbedding = { origins: string[] }

export function parseServerEmbedding(value: string | null | undefined): ServerEmbedding {
  if (!value) return { origins: [] }
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return { origins: [] }
    return { origins: parsed.map(item => typeof item === 'string' ? embedOrigin(item) : null).filter((item): item is string => Boolean(item)).slice(0, MAX_EMBED_ORIGINS) }
  }
  catch { return { origins: [] } }
}

/** The `frame-ancestors` sources: always this Server, then the Owner's sites. */
export function frameAncestorsFor(origins: readonly string[]): string {
  return ["'self'", ...origins].join(' ')
}
