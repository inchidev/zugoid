import { z } from 'zod'
import { requireChannelAccess } from '../../../../utils/guards'
import { cf } from '../../../../utils/cf'
import { failLive, liveRoom } from '../../../../utils/live'
import { parseBody } from '../../../../utils/validate'

const bodySchema = z.object({ userId: z.string().min(8).max(80) })

/** A host turns off someone's microphone in a LiveKit room. The room decides who is a host. */
export default defineEventHandler(async (event) => {
  const channelId = getRouterParam(event, 'id')!
  const access = await requireChannelAccess(event, channelId)
  const { userId } = parseBody(bodySchema, await readBody(event))
  const result = await liveRoom(cf(event).env, channelId).muteLiveParticipant(access.user.id, userId)
  if (!result.ok) failLive(result)
  return { live: result.live }
})
