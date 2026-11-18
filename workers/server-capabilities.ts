import type { RuntimeCapabilities } from '../shared/types'
import { emailInboundProvider } from './inbound-email'
import { serverEmailAvailable, serverEmailProvider } from './mail-transport'
import {
  aiProvider,
  piRuntimeConfigured,
  browserProvider,
  callsProvider,
  type ZugoidEnv,
} from './env'

export const UNAVAILABLE_CAPABILITIES: RuntimeCapabilities = {
  calls: false,
  containers: false,
  browser: null,
  emailOutbound: false,
  emailInbound: null,
  emailProvider: null,
  callsProvider: null,
}

/** Pi is available only when its isolated execution provider and persistence are configured. */
export function containersAvailable(env?: ZugoidEnv): boolean {
  return env ? piRuntimeConfigured(env) : false
}

export function serverCapabilities(env: ZugoidEnv): RuntimeCapabilities {
  const calls = callsProvider(env)
  return {
    calls: calls !== null,
    containers: containersAvailable(env),
    browser: browserProvider(env),
    emailOutbound: serverEmailAvailable(env),
    emailInbound: emailInboundProvider(env),
    emailProvider: serverEmailProvider(env),
    callsProvider: calls,
  }
}

export function serverAiModel(env: ZugoidEnv): string | null {
  const provider = aiProvider(env)
  if (provider === 'openai-compatible') return env.AI_MODEL?.trim() || null
  if (provider === 'workers-ai' || provider === 'workers-ai-rest') return env.AGENT_MODEL?.trim() || null
  return null
}
