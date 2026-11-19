import { z } from 'zod'
import { changeUpdateRecord, requestServerUpdate, type ServerUpdateJob } from '../../../../../shared/server-updates'
import { compareVersions } from '../../../../../shared/release-version'
import { serverVersion } from '../../../../utils/version'
import { updateConfiguration, updateOwner, serverUpdateLaunchUrl } from '../../../../utils/server-updates'
import { fail } from '../../../../utils/cf'
import { zugoidReleases } from '../../../../utils/releases'
import { updateCoverage } from '../../../../utils/update-coverage'
import { parseBody } from '../../../../utils/validate'
import { writeAudit } from '../../../../utils/messages'
import { hostUpdaterAlive } from '../../../../utils/host-updates'
import { isCelld } from '../../../../../shared/server-runtime'

export default defineEventHandler(async (event) => {
  const { env, serverId, member } = await updateOwner(event)
  const body = parseBody(z.object({ requestId: z.string().uuid(), release: z.string().regex(/^v\d+\.\d+\.\d+(?:-(?:alpha|beta|rc)\.\d+)?$/), prereleases: z.boolean().default(false) }), await readBody(event))
  const { store, value } = await updateConfiguration(event, env, serverId)
  if (value.job?.id === body.requestId) {
    if (value.job.targetVersion !== body.release.slice(1) || value.job.requestedBy !== member.user.id) fail(409, 'request_conflict', 'This request ID belongs to another update')
    return { job: value.job, launchUrl: await serverUpdateLaunchUrl(env, value.job, getRequestURL(event).origin) }
  }
  // On a VPS the host runs the update; a request nobody would pick up is refused.
  if (isCelld(env) && !await hostUpdaterAlive(env)) fail(409, 'host_updater_missing', 'The updater on this Server\'s VPS is not answering, so nothing would run this update.')
  const installed = serverVersion(env)
  if (compareVersions(body.release.slice(1), installed) <= 0) fail(400, 'release_not_newer', 'Choose a release newer than the installed version')
  const coverage = await updateCoverage(env, serverId, getRequestURL(event).origin)
  if (!coverage.covered) fail(402, 'update_not_covered', coverage.message || 'This Server has no Zugoid subscription, so zugoid.com offers it no new release.')
  const releases = await zugoidReleases(undefined, { prereleases: body.prereleases, installable: true })
  if (!releases.some(r => r.tagName === body.release)) fail(400, 'release_unavailable', 'Choose an available published Zugoid release')
  const now = new Date().toISOString()
  const job: ServerUpdateJob = { id: body.requestId, serverId, requestedBy: member.user.id, sourceVersion: installed, targetVersion: body.release.slice(1), stage: 'queued', buildId: null, createdAt: now, updatedAt: now, backup: null, error: null }
  let created = false
  await changeUpdateRecord(store, record => {
    created = record.job?.id !== job.id
    try { requestServerUpdate(record, job) } catch (error) { fail(409, 'update_active', error instanceof Error ? error.message : 'An update is already in progress') }
  })
  if (created) {
    await writeAudit(env, { serverId, actorId: member.user.id, action: 'server.update.request', targetType: 'server', targetId: serverId, meta: { requestId: job.id, release: job.targetVersion } })
  }
  return { job: (await store.read()).value.job, launchUrl: await serverUpdateLaunchUrl(env, job, getRequestURL(event).origin) }
})
