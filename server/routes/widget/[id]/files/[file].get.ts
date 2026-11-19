import { fileResponseHeaders } from '../../../../../shared/file-response'
import { cf, fail, requireFiles } from '../../../../utils/cf'
import { limitWidgetRead } from '../../../../utils/widget-pages'
import { bearerToken, findPublicWidget, readVisitorFile, requireVisitor } from '../../../../utils/widget-visitors'

/**
 * One file the Visitor holding the token may open. The frame asks with its token in
 * `Authorization` and shows the answer from a blob: URL, so the token never sits in an address.
 */
export default defineEventHandler(async (event) => {
  const { env } = cf(event)
  const widget = await findPublicWidget(env, getRouterParam(event, 'id') ?? '')
  const visitor = await requireVisitor(env, widget, bearerToken(getHeader(event, 'authorization')))
  await limitWidgetRead(event, visitor)
  const file = await readVisitorFile(env, widget, visitor, getRouterParam(event, 'file') ?? '')
  const object = await requireFiles(env).get(file.key)
  if (!object) fail(404, 'not_found', 'File not found')
  for (const [name, value] of Object.entries(fileResponseHeaders(file.contentType, file.filename))) setHeader(event, name, value)
  setHeader(event, 'Cache-Control', 'private, no-store')
  setHeader(event, 'Content-Length', object.size)
  return object.body
})
