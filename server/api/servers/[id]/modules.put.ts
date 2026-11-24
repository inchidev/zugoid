import { z } from 'zod'
import { HIDEABLE_SECTIONS } from '../../../../shared/server-theme'
import { cf, fail } from '../../../utils/cf'
import { requireMember } from '../../../utils/guards'
import { saveServerModules } from '../../../utils/server-theme'
import { parseBody } from '../../../utils/validate'

const schema = z.object({
  hiddenSections: z.array(z.enum(HIDEABLE_SECTIONS)).default([]),
})

export default defineEventHandler(async (event) => {
  const actor = await requireMember(event, getRouterParam(event, 'id')!)
  if (!actor.isOwner) fail(403, 'forbidden', 'Only the owner can switch modules')
  const body = parseBody(schema, await readBody(event))
  const theme = await saveServerModules(cf(event).env, actor.authorization, body.hiddenSections)
  return { hiddenSections: theme.hiddenSections }
})
