import type { D1Database } from '@cloudflare/workers-types'
import type { AuthorizationContext } from '../../shared/authorization'
import { parseServerEmbedding, SERVER_EMBED_KEY, serverEmbeddingSchema, type ServerEmbedding } from '../../shared/server-embedding'
import { readServerSetting, writeServerSetting } from '../../shared/server-settings'
import { parseServerTheme, SERVER_THEME_KEY, serverThemeSchema, type ServerTheme } from '../../shared/server-theme'
import type { ZugoidEnv } from '../../workers/env'
import { writeAudit } from './messages'
import { parseBody } from './validate'

export async function readServerTheme(db: D1Database): Promise<ServerTheme> {
  try { return parseServerTheme(await readServerSetting(db, SERVER_THEME_KEY)) }
  catch { return parseServerTheme(null) } // A database without server_settings yet: the default look.
}

export async function saveServerTheme(env: ZugoidEnv, auth: AuthorizationContext, request: unknown): Promise<ServerTheme> {
  const theme = parseBody(serverThemeSchema, request)
  await writeServerSetting(env.DB, SERVER_THEME_KEY, JSON.stringify(theme))
  await writeAudit(env, { serverId: auth.serverId, actorId: auth.principal.id, action: 'server.theme.update', targetType: 'server', targetId: auth.serverId, meta: theme, authorization: auth })
  return theme
}

/**
 * The Owner's module switches: which sections this Server leaves out, their pages and their API
 * with them. The rest of the theme is untouched; the data stays, and showing a section again
 * brings it all back.
 */
export async function saveServerModules(env: ZugoidEnv, auth: AuthorizationContext, hiddenSections: readonly string[]): Promise<ServerTheme> {
  const theme = serverThemeSchema.parse({ ...(await readServerTheme(env.DB)), hiddenSections })
  await writeServerSetting(env.DB, SERVER_THEME_KEY, JSON.stringify(theme))
  forgetHiddenSections()
  await writeAudit(env, { serverId: auth.serverId, actorId: auth.principal.id, action: 'server.modules.update', targetType: 'server', targetId: auth.serverId, meta: { hiddenSections: theme.hiddenSections }, authorization: auth })
  return theme
}

/**
 * The sections this Server hides, for the API gate. Reads are cheap but every request pays them,
 * so each isolate holds them for a moment; the Owner's own change is seen at once.
 */
const HIDDEN_SECTIONS_CACHE_MS = 5_000
let hiddenCache: { db: D1Database; at: number; sections: string[] } | null = null

export function forgetHiddenSections() { hiddenCache = null }

export async function hiddenSections(db: D1Database, now = Date.now()): Promise<string[]> {
  if (hiddenCache && hiddenCache.db === db && now - hiddenCache.at < HIDDEN_SECTIONS_CACHE_MS) return hiddenCache.sections
  const { hiddenSections } = await readServerTheme(db)
  hiddenCache = { db, at: now, sections: hiddenSections }
  return hiddenSections
}

/**
 * Every response carries `frame-ancestors`, so the Owner's sites are read through a short
 * per-isolate cache. A change made here is seen at once by this isolate and within
 * {@link EMBED_CACHE_MS} by the others.
 */
const EMBED_CACHE_MS = 30_000
let embedCache: { db: D1Database; at: number; origins: string[] } | null = null

export function forgetEmbedOrigins() { embedCache = null }

export async function readServerEmbedding(db: D1Database): Promise<ServerEmbedding> {
  try { return parseServerEmbedding(await readServerSetting(db, SERVER_EMBED_KEY)) }
  catch { return { origins: [] } }
}

export async function embedOrigins(db: D1Database | undefined, now = Date.now()): Promise<string[]> {
  if (!db) return []
  if (embedCache && embedCache.db === db && now - embedCache.at < EMBED_CACHE_MS) return embedCache.origins
  const { origins } = await readServerEmbedding(db)
  embedCache = { db, at: now, origins }
  return origins
}

export async function saveServerEmbedding(env: ZugoidEnv, auth: AuthorizationContext, request: unknown): Promise<ServerEmbedding> {
  const embedding = parseBody(serverEmbeddingSchema, request)
  await writeServerSetting(env.DB, SERVER_EMBED_KEY, JSON.stringify(embedding.origins))
  forgetEmbedOrigins()
  await writeAudit(env, { serverId: auth.serverId, actorId: auth.principal.id, action: 'server.embedding.update', targetType: 'server', targetId: auth.serverId, meta: embedding, authorization: auth })
  return embedding
}
