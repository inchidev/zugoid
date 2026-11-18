import type { H3Event } from 'h3'
import { DEFAULT_APP_NAME, DEFAULT_APP_TITLE } from '../../shared/app-branding'
import { cf } from './cf'
import { publicServerAppearance } from './server-appearance'
import { readServerTheme } from './server-theme'

const escape = (value: string) => value.replace(/[&<>"']/gu, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)

/**
 * The page shell names Zugoid before the Client starts (title, home-screen name, link previews). When Appearance says
 * to show this Server instead of Zugoid, those name the Server, and Zugoid's tagline is gone. The icon stays Zugoid's
 * until the Owner sets one: the manifest already uses theirs.
 */
export function brandedShell(body: string, name: string): string {
  const safe = escape(name)
  return body
    .replace(`<title>${DEFAULT_APP_NAME}</title>`, `<title>${safe}</title>`)
    .replace(/(<meta\s[^>]*(?:property|name)="(?:og:title|twitter:title|application-name|apple-mobile-web-app-title)"\s+content=")Zugoid(")/gu, `$1${safe}$2`)
    .replaceAll(`content="${DEFAULT_APP_TITLE}"`, `content="${safe}"`)
}

/** The shell as this Server's Appearance wants it; anything that is not the shell passes as it came. */
export async function applyShellBranding(event: H3Event, body: unknown): Promise<unknown> {
  if (typeof body !== 'string' || !body.includes(`<title>${DEFAULT_APP_NAME}</title>`)) return body
  const type = getResponseHeader(event, 'content-type')
  if (type !== undefined && !String(type).toLowerCase().includes('text/html')) return body
  try {
    const { env } = cf(event)
    if (!(await readServerTheme(env.DB)).hideZugoid) return body
    const { name } = await publicServerAppearance(env.DB, getRequestURL(event).origin, DEFAULT_APP_NAME)
    return name && name !== DEFAULT_APP_NAME ? brandedShell(body, name) : body
  }
  catch { return body } // Prerender and tests have no bindings: the shell as built.
}
