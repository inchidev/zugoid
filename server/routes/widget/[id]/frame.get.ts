import { cf } from '../../../utils/cf'
import { sendWidgetFrame } from '../../../utils/widget-pages'
import { findPublicWidget } from '../../../utils/widget-visitors'

/** The chat a Widget's loader opens: a standalone page only the Widget's sites may frame. */
export default defineEventHandler(async event => sendWidgetFrame(event, await findPublicWidget(cf(event).env, getRouterParam(event, 'id') ?? '')))
