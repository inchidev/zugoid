import { cf, fail } from '../../../utils/cf'
import { limitWidgetUpload, widgetJsonHeaders } from '../../../utils/widget-pages'
import { bearerToken, findPublicWidget, requireVisitor, storeVisitorFile } from '../../../utils/widget-visitors'

/** A picture or voice message from the Visitor holding the token, kept until they send it. */
export default defineEventHandler(async (event) => {
  widgetJsonHeaders(event)
  const { env } = cf(event)
  const widget = await findPublicWidget(env, getRouterParam(event, 'id') ?? '')
  const visitor = await requireVisitor(env, widget, bearerToken(getHeader(event, 'authorization')))
  await limitWidgetUpload(event, visitor)
  const form = await readMultipartFormData(event)
  const file = form?.find(part => part.name === 'file' && part.data)
  if (!file?.data) fail(400, 'bad_request', 'Missing file')
  return { file: await storeVisitorFile(env, widget, visitor, { data: file.data, filename: file.filename }) }
})
