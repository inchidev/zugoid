import type { RunEnvironment } from '../../shared/code-environments'
import type { ExpectedPush } from '../../shared/git-pktline'
import type { ZugoidEnv } from '../../workers/env'
import { giteaCredentials, giteaPush, giteaRemote, giteaSourceFetch } from './gitea'
import { gitlabCredentials, gitlabPush, gitlabRemote, gitlabSourceFetch } from './gitlab'

/**
 * Gitea and GitLab are reached with a token that stays on this Server: a box or a Compute Node fetches and
 * pushes through the Server (the source and publish routes, or BoxOutbound), which adds it there.
 */
type Brokered = Pick<RunEnvironment, 'provider' | 'gitConnectionId' | 'sourceRepo'>
export const tokenBrokered = (provider: RunEnvironment['provider']) => provider === 'gitea' || provider === 'gitlab'

/** Fails closed when the environment's connection was disabled or its credential cannot be decrypted. */
export async function requireBrokerCredentials(env: ZugoidEnv, environment: Brokered) {
  if (environment.provider === 'gitlab') await gitlabCredentials(env, environment.gitConnectionId)
  else await giteaCredentials(env, environment.gitConnectionId)
}
export function brokerRemote(env: ZugoidEnv, environment: Brokered) {
  return environment.provider === 'gitlab' ? gitlabRemote(env, environment.gitConnectionId, environment.sourceRepo) : giteaRemote(env, environment.gitConnectionId, environment.sourceRepo)
}
export function brokerSourceFetch(env: ZugoidEnv, environment: Brokered, suffix: string, request: Request) {
  return environment.provider === 'gitlab' ? gitlabSourceFetch(env, environment.gitConnectionId, environment.sourceRepo, suffix, request) : giteaSourceFetch(env, environment.gitConnectionId, environment.sourceRepo, suffix, request)
}
export function brokerPush(env: ZugoidEnv, environment: Brokered, suffix: string, request: Request, expected: ExpectedPush) {
  return environment.provider === 'gitlab' ? gitlabPush(env, environment.gitConnectionId, environment.sourceRepo, suffix, request, expected) : giteaPush(env, environment.gitConnectionId, environment.sourceRepo, suffix, request, expected)
}
