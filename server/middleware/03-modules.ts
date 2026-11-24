import { apiModuleSection } from '~~/shared/server-navigation'
import { cf, fail } from '../utils/cf'
import { hiddenSections } from '../utils/server-theme'

/**
 * A section the Server leaves out (Server settings → Modules) keeps its data but answers 404,
 * so old links, Agents and other clients find nothing there either. The Server's own paths
 * and Chat have no module: they are the Server.
 */
export default defineEventHandler(async (event) => {
  const path = (event.path || '').split('?')[0]!
  const section = apiModuleSection(path)
  if (!section) return
  const { env } = cf(event)
  if ((await hiddenSections(env.DB)).includes(section)) throw fail(404, 'not_found', 'Not found')
})
