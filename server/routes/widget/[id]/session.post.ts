import { z } from 'zod'
import { WIDGET_LIMITS } from '../../../../shared/customer-widgets'
import { cf } from '../../../utils/cf'
import { parseBody } from '../../../utils/validate'
import { limitWidgetSession, requestCountry, requireWidgetHuman, widgetJsonHeaders } from '../../../utils/widget-pages'
import { findPublicWidget, startVisitorSession } from '../../../utils/widget-visitors'

const schema = z.object({
  name: z.string().max(WIDGET_LIMITS.claimedName * 2).optional(),
  email: z.string().max(254).optional(),
})

/** A new Visitor on this Widget. The token in the answer is the only copy. */
export default defineEventHandler(async (event) => {
  widgetJsonHeaders(event)
  const { env } = cf(event)
  const widget = await findPublicWidget(env, getRouterParam(event, 'id') ?? '')
  const body = parseBody(schema, await readBody(event).catch(() => ({})) ?? {})
  await limitWidgetSession(event, widget)
  await requireWidgetHuman(event, widget)
  return startVisitorSession(env, widget, { ...body, userAgent: getHeader(event, 'user-agent') ?? null, country: requestCountry(event) })
})
