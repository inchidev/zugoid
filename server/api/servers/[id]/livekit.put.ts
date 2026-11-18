import { z } from 'zod'
import { getServerId } from '../../../../shared/server-id'
import type { LiveKitSettingsAdminDTO } from '../../../../shared/types'
import { liveKitSettingsAdminDto, loadLiveKitConfig, normalizeLiveKitUrl, saveLiveKitConfig, testLiveKit } from '../../../../workers/livekit'
import { cf, fail } from '../../../utils/cf'
import { requireMember } from '../../../utils/guards'
import { closeLiveRooms } from '../../../utils/live'
import { writeAudit } from '../../../utils/messages'
import { parseBody } from '../../../utils/validate'

const bodySchema = z.object({
  url: z.string().trim().min(1).max(500),
  apiKey: z.string().trim().min(1).max(200),
  /** Left out to keep the saved secret while changing the address or key. */
  apiSecret: z.string().trim().min(1).max(500).optional(),
})

/** Connect Live to a LiveKit. The credentials are tested before they are kept. */
export default defineEventHandler(async (event): Promise<{ livekit: LiveKitSettingsAdminDTO }> => {
  const member = await requireMember(event, getRouterParam(event, 'id')!)
  if (!member.isOwner) fail(403, 'forbidden', 'Only the owner can manage LiveKit')
  const { env } = cf(event)
  const current = await loadLiveKitConfig(env)
  if (current?.source === 'deployment') fail(400, 'managed_by_deployment', 'LiveKit is managed by the deployment')
  const body = parseBody(bodySchema, await readBody(event))
  const url = normalizeLiveKitUrl(body.url)
  if (!url) fail(400, 'invalid_url', 'The LiveKit address starts with wss://')
  const apiSecret = body.apiSecret ?? current?.apiSecret
  if (!apiSecret) fail(400, 'secret_required', 'Enter the LiveKit API secret')
  const test = await testLiveKit({ url, apiKey: body.apiKey, apiSecret, source: 'database' })
  if (!test.ok) fail(400, 'livekit_connection_failed', test.message)
  // Rooms started on the old media plane cannot move to the new one.
  await closeLiveRooms(env)
  await saveLiveKitConfig(env, { url, apiKey: body.apiKey, apiSecret })
  const serverId = await getServerId(env.DB)
  await writeAudit(env, { serverId, actorId: member.user.id, action: 'livekit.settings.update', targetType: 'server', targetId: serverId, meta: { url } })
  return { livekit: await liveKitSettingsAdminDto(env) }
})
