import { version as packageVersion } from '../../package.json'

declare const __ZUGOID_VERSION__: string | undefined

/**
 * The installed release version, baked into the bundle at build time. A
 * published release always bakes its own package version; the installer never
 * sets a version binding. `ZUGOID_VERSION` remains only as a local fixture
 * override so integration fixtures can impersonate an older release.
 */
export function serverVersion(env?: { ZUGOID_VERSION?: string }): string {
  if (env?.ZUGOID_VERSION?.trim()) return env.ZUGOID_VERSION.trim()
  return typeof __ZUGOID_VERSION__ === 'string' && __ZUGOID_VERSION__.trim() ? __ZUGOID_VERSION__.trim() : packageVersion
}
