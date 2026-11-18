import { cf } from '../../../utils/cf'
import { limitWidgetRead, widgetJsonHeaders } from '../../../utils/widget-pages'
import { bearerToken, findPublicWidget, listVisitorMessages, requireVisitor } from '../../../utils/widget-visitors'

/** What the Visitor holding the token may read, after a cursor from an earlier answer. */
export default defineEventHandler(async (event) => {
  widgetJsonHeaders(event)
  const { env } = cf(event)
  const widget = await findPublicWidget(env, getRouterParam(event, 'id') ?? '')
  const visitor = await requireVisitor(env, widget, bearerToken(getHeader(event, 'authorization')))
  await limitWidgetRead(event, visitor)
  const after = getQuery(event).after
  return listVisitorMessages(env, widget, visitor, typeof after === 'string' ? after : null)
})
