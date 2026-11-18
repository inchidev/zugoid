import type { LiveKitSettingsAdminDTO } from '../../../../shared/types'
import { liveKitSettingsAdminDto } from '../../../../workers/livekit'
import { cf, fail } from '../../../utils/cf'
import { requireMember } from '../../../utils/guards'

export default defineEventHandler(async (event): Promise<{ livekit: LiveKitSettingsAdminDTO }> => {
  setHeader(event, 'Cache-Control', 'no-store')
  const member = await requireMember(event, getRouterParam(event, 'id')!)
  if (!member.isOwner) fail(403, 'forbidden', 'Only the owner can manage LiveKit')
  return { livekit: await liveKitSettingsAdminDto(cf(event).env) }
})
