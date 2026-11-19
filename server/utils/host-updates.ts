import type { ZugoidEnv } from '../../workers/env'
import { readServerSetting, writeServerSetting } from '../../shared/server-settings'
import { isCelld } from '../../shared/server-runtime'

/**
 * Updates from Settings on a VPS Server. The Server cannot replace its own image, so the host does: the Zugoid VPS
 * installer adds a systemd timer (`zugoid host-update`) that asks POST /api/host/update every half minute whether the
 * Owner requested an update, runs the same verified `zugoid upgrade` an operator would, with its backup and rollback,
 * and reports how it went. It proves itself with ZUGOID_HOST_TOKEN, which only the host's .env and the Server share.
 * A Server deployed another way (Coolify, plain Compose) has no token and is updated where it is deployed.
 */
export const HOST_UPDATER_SEEN = 'host_updater_seen'
/** The updater asks every half minute; after this long without a word, Settings stops offering updates from here. */
export const HOST_UPDATER_FRESH_MS = 3 * 60 * 1000

export function hostUpdaterToken(env: Pick<ZugoidEnv, 'ZUGOID_RUNTIME' | 'ZUGOID_HOST_TOKEN'>): string | null {
  const token = env.ZUGOID_HOST_TOKEN?.trim() ?? ''
  return isCelld(env) && token.length >= 32 ? token : null
}

/** Whether this Server's host updater asked recently, so an update requested now is picked up. */
export async function hostUpdaterAlive(env: Pick<ZugoidEnv, 'ZUGOID_RUNTIME' | 'ZUGOID_HOST_TOKEN' | 'DB'>, now = Date.now()) {
  if (!hostUpdaterToken(env)) return false
  const seen = Number(await readServerSetting(env.DB, HOST_UPDATER_SEEN).catch(() => null))
  return Number.isFinite(seen) && now - seen < HOST_UPDATER_FRESH_MS
}

export const noteHostUpdater = (db: D1Database, now = Date.now()) => writeServerSetting(db, HOST_UPDATER_SEEN, String(now))

/** Constant-time comparison of the bearer token the host sent. */
export async function hostTokenMatches(expected: string, authorization: string | undefined) {
  const given = /^Bearer\s+(\S+)$/i.exec(authorization ?? '')?.[1] ?? ''
  const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
  const [a, b] = await Promise.all([digest(expected), digest(given)])
  let difference = given.length ? 0 : 1
  for (let i = 0; i < a.length; i++) difference |= a[i]! ^ b[i]!
  return difference === 0
}
