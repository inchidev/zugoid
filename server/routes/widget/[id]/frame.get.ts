import { cf } from '../../../utils/cf'
import { readServerTheme } from '../../../utils/server-theme'
import { sendWidgetFrame, widgetLook } from '../../../utils/widget-pages'
import { findPublicWidget } from '../../../utils/widget-visitors'

/** The chat a Widget's loader opens: a standalone page only the Widget's sites may frame, in the Server's look. */
export default defineEventHandler(async (event) => {
  const { env } = cf(event)
  const widget = await findPublicWidget(env, getRouterParam(event, 'id') ?? '')
  return sendWidgetFrame(event, widget, widgetLook(await readServerTheme(env.DB)))
})
