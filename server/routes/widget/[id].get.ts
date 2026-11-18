import { cf, fail } from '../../utils/cf'
import { requestServerOrigin } from '../../utils/server-origins'
import { widgetLoaderScript } from '../../utils/widget-pages'
import { findPublicWidget } from '../../utils/widget-visitors'

/** `/widget/<public id>.js`: the loader a website adds with the embed code. Cached briefly. */
export default defineEventHandler(async (event) => {
  const file = getRouterParam(event, 'id') ?? ''
  if (!file.endsWith('.js')) fail(404, 'not_found', 'Widget not found')
  const { env } = cf(event)
  const widget = await findPublicWidget(env, file.slice(0, -'.js'.length))
  const serverOrigin = await requestServerOrigin(env, getRequestURL(event).origin)
  setHeader(event, 'Content-Type', 'text/javascript; charset=utf-8')
  setHeader(event, 'Cache-Control', 'public, max-age=300')
  setHeader(event, 'Cross-Origin-Resource-Policy', 'cross-origin')
  return widgetLoaderScript({ serverOrigin, publicId: widget.publicId, sites: widget.sites })
})
