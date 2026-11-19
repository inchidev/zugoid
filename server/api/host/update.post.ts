import { z } from 'zod'
import { activeUpdate, changeUpdateRecord } from '../../../shared/server-updates'
import { getServerId } from '../../../shared/server-id'
import { cf, fail } from '../../utils/cf'
import { hostTokenMatches, hostUpdaterToken, noteHostUpdater } from '../../utils/host-updates'
import { updateStorage } from '../../utils/server-updates'
import { serverVersion } from '../../utils/version'
import { writeAudit } from '../../utils/messages'

const input = z.discriminatedUnion('action', [
  z.object({ action: z.literal('poll') }).strict(),
  z.object({
    action: z.literal('report'),
    id: z.string().uuid(),
    stage: z.enum(['backing_up', 'updating', 'verifying', 'complete', 'failed']),
    error: z.string().max(500).nullable().default(null),
  }).strict(),
])

/**
 * The VPS host's updater (server/utils/host-updates.ts). `poll` answers the update the Owner requested, if one waits;
 * `report` moves that update along as the host runs it. Nothing here can choose a release: the Owner did, and the host
 * installs only a published, checksum-verified one.
 */
export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const { env } = cf(event)
  const token = hostUpdaterToken(env)
  if (!token || !await hostTokenMatches(token, getHeader(event, 'authorization'))) fail(403, 'host_update_denied', 'Only this Server\'s VPS host can ask this')
  const body = input.safeParse(await readBody(event).catch(() => null))
  if (!body.success) fail(400, 'host_update_invalid', 'Send poll or report')
  await noteHostUpdater(env.DB)
  const serverId = await getServerId(env.DB)
  const store = updateStorage(env, serverId)
  if (body.data.action === 'poll') {
    const { value } = await store.read()
    const job = value.job?.stage === 'queued' ? { id: value.job.id, targetVersion: value.job.targetVersion } : null
    return { installedVersion: serverVersion(env), job }
  }
  const report = body.data
  let requestedBy = ''
  await changeUpdateRecord(store, (record) => {
    if (record.job?.id !== report.id || !activeUpdate(record.job)) fail(409, 'update_not_active', 'This update is no longer active')
    record.job.stage = report.stage
    record.job.error = report.stage === 'failed' ? (report.error || 'The update did not succeed; the previous Server was restored.') : null
    record.job.updatedAt = new Date().toISOString()
    if (report.stage === 'complete' || report.stage === 'failed') { record.backupToken = null; record.backupBusy = false }
    requestedBy = record.job.requestedBy
  })
  if (report.stage === 'complete' || report.stage === 'failed') {
    await writeAudit(env, { serverId, actorId: requestedBy, action: `server.update.${report.stage}`, targetType: 'server', targetId: serverId, meta: { requestId: report.id, by: 'host' } })
  }
  return { ok: true }
})
