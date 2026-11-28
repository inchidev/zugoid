import { getServerId } from '../../../../shared/server-id'
import type { GadgetRuntimeDTO } from '../../../../shared/gadgets'
import { cf } from '../../../utils/cf'
import { requireMember } from '../../../utils/guards'
import { openGadget, previewGadget } from '../../../utils/gadget-runtime'

export default defineEventHandler(async (event): Promise<GadgetRuntimeDTO> => {
  const actor = await requireMember(event, (await getServerId(cf(event).env.DB)))
  if (getQuery(event).preview === '1') return previewGadget(cf(event).env, actor, getRouterParam(event, 'id')!)
  return openGadget(cf(event).env, actor, getRouterParam(event, 'id')!)
})
