/**
 * Where a Server runs, from `ZUGOID_RUNTIME`:
 * - `cloudflare` (or unset, or `workers`): a Cloudflare account of its own, installed from zugoid.com/create, which
 *   manages its domains and updates through the installer's grant;
 * - `celld`: a VPS, where the operator's CLI manages it.
 */
export type ServerRuntime = 'cloudflare' | 'celld'

export function serverRuntime(env?: { ZUGOID_RUNTIME?: string }): ServerRuntime {
  return env?.ZUGOID_RUNTIME?.trim().toLowerCase() === 'celld' ? 'celld' : 'cloudflare'
}

/** The Server runs on a VPS, from a Docker image. */
export const isCelld = (env?: { ZUGOID_RUNTIME?: string }) => serverRuntime(env) === 'celld'

/** Someone other than the Server manages its infrastructure: its origin is fixed and it never installs or updates itself. */
export const isOperatorManaged = (env?: { ZUGOID_RUNTIME?: string }) => serverRuntime(env) !== 'cloudflare'
