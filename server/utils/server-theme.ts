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
