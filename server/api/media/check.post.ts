import { z } from 'zod'
import { getServerId } from '../../../shared/server-id'
import { requireMember } from '../../utils/guards'
import { cf } from '../../utils/cf'
import { knownImportKeys } from '../../utils/media'
import { parseBody } from '../../utils/validate'

const schema = z.object({ keys: z.array(z.string().min(1).max(400)).max(500) }).strict()

/** Which of these files are already in your library, so an import sends only what is new. */
export default defineEventHandler(async (event) => {
  const { env } = cf(event)
  const member = await requireMember(event, await getServerId(env.DB))
  return { known: await knownImportKeys(env, member, parseBody(schema, await readBody(event)).keys) }
})
