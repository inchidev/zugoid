import { z } from 'zod'
import { getServerId } from '../../../../../shared/server-id'
import { requireMember } from '../../../../utils/guards'
import { cf } from '../../../../utils/cf'
import { completeMultipart } from '../../../../utils/media'
import { parseBody } from '../../../../utils/validate'

const schema = z.object({ parts: z.array(z.object({ partNumber: z.number().int().min(1).max(10_000), etag: z.string().max(200) })).min(1).max(10_000) }).strict()

export default defineEventHandler(async (event) => {
  const { env } = cf(event)
  const member = await requireMember(event, await getServerId(env.DB))
  return completeMultipart(env, member, getRouterParam(event, 'upload')!, parseBody(schema, await readBody(event)).parts)
})
