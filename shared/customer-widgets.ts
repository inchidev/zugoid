/** The synthetic author of what Visitors write through a Widget, like `mail-external` for email. */
export const CUSTOMER_VISITOR_USER_ID = 'customer-visitor'

export const WIDGET_LIMITS = {
  sites: 20,
  name: 80,
  greeting: 500,
  /** One message from a Visitor. */
  message: 4000,
  claimedName: 80,
  userAgent: 512,
  /** Messages a Visitor reads in one request. */
  page: 200,
  /** Files on one message from a Visitor. */
  files: 4,
} as const

/** What a Visitor may send: pictures and voice recordings. */
export const WIDGET_FILE_TYPES: ReadonlySet<string> = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/wav'])

/** A Widget's public ID: random, in the embed code and the frame's address. */
export const WIDGET_PUBLIC_ID = /^[A-Za-z0-9_-]{16,64}$/u

const HOST = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u

/**
 * A site as a Widget stores it: an exact `https://` origin, or `https://*.example.com` for the
 * subdomains of a domain. Null when it is neither. A path, query or `http://` is refused, and a
 * wildcard needs a domain with at least two labels, so `https://*.com` is never a site.
 */
export function normalizeWidgetSite(value: string): string | null {
  const text = value.trim().toLowerCase().replace(/\/+$/u, '')
  const match = /^https:\/\/(\*\.)?([^/:?#]+)(?::(\d{1,5}))?$/u.exec(text)
  if (!match) return null
  const [, wildcard, host, port] = match
  if (!HOST.test(host!)) return null
  if (port && (Number(port) < 1 || Number(port) > 65535)) return null
  // A browser leaves out the default port, so the stored origin does too.
  return `https://${wildcard ?? ''}${host}${port && Number(port) !== 443 ? `:${Number(port)}` : ''}`
}

/** Whether a page at `origin` may show a Widget with these sites. */
export function widgetSiteAllows(sites: readonly string[], origin: string): boolean {
  let url: URL
  try { url = new URL(origin) }
  catch { return false }
  if (url.protocol !== 'https:') return false
  const host = url.host.toLowerCase()
  return sites.some((site) => {
    const listed = site.slice('https://'.length)
    if (!listed.startsWith('*.')) return listed === host
    return host.endsWith(listed.slice(1)) && host.length > listed.length - 1
  })
}

/**
 * The Widget frame's document policy. Only the Widget's sites may frame it; with none it
 * cannot be framed at all. It talks only to its own Server and loads nothing else.
 */
export function widgetFrameCsp(sites: readonly string[]): string {
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'unsafe-inline'",
    // A file the frame fetched with its token is shown from a blob: URL.
    "img-src 'self' data: blob:",
    "media-src blob:",
    "font-src 'self'",
    "connect-src 'self'",
    `frame-ancestors ${sites.length ? sites.join(' ') : "'none'"}`,
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ')
}

/** The one line a site adds to show the Widget. */
export function widgetEmbedCode(serverOrigin: string, publicId: string): string {
  return `<script src="${serverOrigin}/widget/${publicId}.js" async></script>`
}
