import { serverVersion } from '../../../utils/version'
import type { UpdateStatusDTO } from '../../../../shared/releases'
import { compareVersions } from '../../../../shared/release-version'
import { serverUpdateLaunchUrl, updateConfiguration, updateOwner } from '../../../utils/server-updates'
import { zugoidReleases } from '../../../utils/releases'
import { updateCoverage } from '../../../utils/update-coverage'

export default defineEventHandler(async (event): Promise<UpdateStatusDTO> => {
  setHeader(event, 'Cache-Control', 'no-store')
  const { env, serverId } = await updateOwner(event)
  const installedVersion = serverVersion(env)
  const status: UpdateStatusDTO = {
    installedVersion, management: 'operator', latestRelease: null, releasesBehind: 0,
    updateAvailable: false, checkedAt: new Date().toISOString(), checkFailed: false, releases: [],
    updateControl: { available: false, configured: false, source: null, job: null, reason: null },
  }
  try {
    const config = await updateConfiguration(event, env, serverId)
    status.updateControl = { available: true, configured: true, mode: 'installer', backupDestination: env.BACKUPS ? 'bucket' : 'download', source: null, job: config.value.job, buildUrl: null, launchUrl: await serverUpdateLaunchUrl(env, config.value.job, getRequestURL(event).origin), reason: null }
  } catch {
    status.updateControl!.reason = env.ZUGOID_RUNTIME?.trim().toLowerCase() === 'celld'
      ? 'This Server runs from a Docker image, so it is updated where it is deployed. In Coolify or Docker Compose, use ghcr.io/inchidev/zugoid:latest or set a newer release version, then redeploy. A VPS installer Server uses zugoid upgrade.'
      : 'Cloudflare updates need the published Zugoid installer.'
  }
  const coverage = updateCoverage(env, serverId, getRequestURL(event).origin)
  try {
    const prereleases = getQuery(event).prereleases === 'true'
    const releases = (await zugoidReleases(undefined, { prereleases, installable: true })).sort((a, b) => compareVersions(b.tagName, a.tagName))
    const newer = releases.filter(release => compareVersions(release.tagName, installedVersion) > 0)
    status.releases = releases
    status.latestRelease = releases[0] ?? null
    status.releasesBehind = newer.length
    status.updateAvailable = newer.length > 0
  } catch { status.checkFailed = true }
  // A Server zugoid.com does not cover is offered no new release; it keeps running the one it has.
  status.coverage = await coverage
  if (!status.coverage.covered) status.updateAvailable = false
  return status
})
