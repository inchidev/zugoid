import { serverVersion } from '../../../utils/version'
import type { UpdateStatusDTO } from '../../../../shared/releases'
import { compareVersions } from '../../../../shared/release-version'
import { serverUpdateLaunchUrl, updateConfiguration, updateOwner } from '../../../utils/server-updates'
import { zugoidReleases } from '../../../utils/releases'
import { updateCoverage } from '../../../utils/update-coverage'
import { hostUpdaterAlive, hostUpdaterToken } from '../../../utils/host-updates'
import { isCelld } from '../../../../shared/server-runtime'

export default defineEventHandler(async (event): Promise<UpdateStatusDTO> => {
  setHeader(event, 'Cache-Control', 'no-store')
  const { env, serverId } = await updateOwner(event)
  const installedVersion = serverVersion(env)
  const status: UpdateStatusDTO = {
    installedVersion, management: 'operator', latestRelease: null, releasesBehind: 0,
    updateAvailable: false, checkedAt: new Date().toISOString(), checkFailed: false, releases: [],
    updateControl: { available: false, configured: false, source: null, job: null, reason: null },
  }
  if (isCelld(env)) {
    // A VPS Server is updated by its host; Settings offers it only while the host updater answers.
    const config = hostUpdaterToken(env) ? await updateConfiguration(event, env, serverId).catch(() => null) : null
    if (config && (await hostUpdaterAlive(env) || config.value.job)) {
      status.updateControl = { available: true, configured: true, mode: 'host', backupDestination: 'host', source: null, job: config.value.job, buildUrl: null, launchUrl: null, reason: null }
    } else {
      status.updateControl!.reason = hostUpdaterToken(env)
        ? 'The updater on this Server\'s VPS has not answered for a few minutes. Check that the host is running; updates from here resume when it answers.'
        : 'This Server runs from a Docker image, so it is updated where it is deployed: in Coolify or Docker Compose, redeploy with a newer ghcr.io/inchidev/zugoid image. A Server from the Zugoid VPS installer updates from here once its host has the updater, which comes with release 0.3.0: update to it once with sudo zugoid upgrade.'
    }
  } else {
    try {
      const config = await updateConfiguration(event, env, serverId)
      status.updateControl = { available: true, configured: true, mode: 'installer', backupDestination: env.BACKUPS ? 'bucket' : 'download', source: null, job: config.value.job, buildUrl: null, launchUrl: await serverUpdateLaunchUrl(env, config.value.job, getRequestURL(event).origin), reason: null }
    } catch {
      status.updateControl!.reason = 'Cloudflare updates need the published Zugoid installer.'
    }
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
