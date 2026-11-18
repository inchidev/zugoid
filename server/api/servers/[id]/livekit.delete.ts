import { getServerId } from '../../../../shared/server-id'
import type { LiveKitSettingsAdminDTO } from '../../../../shared/types'
import { deleteLiveKitConfig, liveKitSettingsAdminDto, loadLiveKitConfig } from '../../../../workers/livekit'
import { cf, fail } from '../../../utils/cf'
import { requireMember } from '../../../utils/guards'
import { closeLiveRooms } from '../../../utils/live'
import { writeAudit } from '../../../utils/messages'

/** Disconnect LiveKit. Live goes back to RealtimeKit when the Server has it. */
export default defineEventHandler(async (event): Promise<{ livekit: LiveKitSettingsAdminDTO }> => {
  const member = await requireMember(event, getRouterParam(event, 'id')!)
  if (!member.isOwner) fail(403, 'forbidden', 'Only the owner can manage LiveKit')
  const { env } = cf(event)
  if ((await loadLiveKitConfig(env))?.source === 'deployment') fail(400, 'managed_by_deployment', 'LiveKit is managed by the deployment')
  // End live rooms while their rooms can still be reached with these credentials.
  await closeLiveRooms(env)
  await deleteLiveKitConfig(env)
  const serverId = await getServerId(env.DB)
  await writeAudit(env, { serverId, actorId: member.user.id, action: 'livekit.settings.remove', targetType: 'server', targetId: serverId })
  return { livekit: await liveKitSettingsAdminDto(env) }
})
