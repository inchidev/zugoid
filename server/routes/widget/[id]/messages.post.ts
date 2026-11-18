import { z } from 'zod'
import { WIDGET_LIMITS } from '../../../../shared/customer-widgets'
import { cf } from '../../../utils/cf'
import { parseBody } from '../../../utils/validate'
import { limitWidgetMessage, widgetJsonHeaders } from '../../../utils/widget-pages'
import { bearerToken, findPublicWidget, postVisitorMessage, requireVisitor } from '../../../utils/widget-visitors'

const schema = z.object({
  content: z.string().max(WIDGET_LIMITS.message * 2),
  name: z.string().max(WIDGET_LIMITS.claimedName * 2).optional(),
  email: z.string().max(254).optional(),
})

/** A message from the Visitor holding the token, into their own Conversation. */
export default defineEventHandler(async (event) => {
  widgetJsonHeaders(event)
  const { env } = cf(event)
  const widget = await findPublicWidget(env, getRouterParam(event, 'id') ?? '')
  const visitor = await requireVisitor(env, widget, bearerToken(getHeader(event, 'authorization')))
  const body = parseBody(schema, await readBody(event))
  await limitWidgetMessage(event, visitor)
  return { message: await postVisitorMessage(env, widget, visitor, body) }
})
