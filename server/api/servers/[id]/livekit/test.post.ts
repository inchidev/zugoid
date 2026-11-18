import { loadLiveKitConfig, testLiveKit } from '../../../../../workers/livekit'
import { cf, fail } from '../../../../utils/cf'
import { requireMember } from '../../../../utils/guards'

/** Check that the saved LiveKit still answers to its key and secret. */
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  setHeader(event, 'Cache-Control', 'no-store')
  const member = await requireMember(event, getRouterParam(event, 'id')!)
  if (!member.isOwner) fail(403, 'forbidden', 'Only the owner can test LiveKit')
  const config = await loadLiveKitConfig(cf(event).env)
  if (!config) fail(400, 'livekit_unconfigured', 'Connect LiveKit first')
  const result = await testLiveKit(config)
  if (!result.ok) fail(502, 'livekit_connection_failed', result.message)
  return { ok: true }
})
