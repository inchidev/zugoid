import { applyInlineScriptHashes } from '../utils/csp-script-hashes'
import { applyShellBranding } from '../utils/shell-branding'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('beforeResponse', async (event, response) => {
    response.body = await applyShellBranding(event, response.body)
    await applyInlineScriptHashes(event, response.body)
  })
})
