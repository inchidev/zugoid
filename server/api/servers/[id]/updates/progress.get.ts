import { serverVersion } from '../../../../utils/version'
import { isCelld } from '../../../../../shared/server-runtime'
import { serverUpdateLaunchUrl, updateConfiguration, updateOwner } from '../../../../utils/server-updates'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const { env, serverId } = await updateOwner(event)
  const config = await updateConfiguration(event, env, serverId)
  return { installedVersion: serverVersion(env), configured: true, mode: isCelld(env) ? 'host' : 'installer', job: config.value.job, buildUrl: null, launchUrl: await serverUpdateLaunchUrl(env, config.value.job, getRequestURL(event).origin) }
})
