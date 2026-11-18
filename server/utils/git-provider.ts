import type { CodeEnvironmentConfig } from '../../shared/code-environments'
import type { ZugoidEnv } from '../../workers/env'
import { gitConnectionProvider, githubConnectionCredentials } from './git-connections'
import { agentRepositories, githubAgentClient } from './github-agent-client'
import { giteaAgentClient, giteaCredentials, giteaRepositories, type GiteaAccess } from './gitea'
import { gitlabAgentClient, gitlabCredentials, gitlabRepositories } from './gitlab'
import { artifactsAvailability, requireArtifacts } from './factory-artifacts'
import { fail } from './cf'

/**
 * Whether a connection (or, without one, any connection or the deployment App) can broker repository access.
 * A Zugoid repository needs no connection: its binding is there or it is not.
 */
export async function gitAgentConfigured(env: ZugoidEnv, connectionId?: string | null, provider?: CodeEnvironmentConfig['provider']): Promise<boolean> {
  if (provider === 'artifacts') return artifactsAvailability(env).available
  if (!connectionId) {
    if (env.GITHUB_AGENT_APP_ID && env.GITHUB_AGENT_APP_PRIVATE_KEY) return true
    return Boolean(await env.DB.prepare("SELECT 1 FROM git_connections WHERE provider IN ('github','gitea','gitlab') AND enabled=1 LIMIT 1").first())
  }
  try {
    const kind = await gitConnectionProvider(env, connectionId)
    if (kind === 'gitea') return Boolean(await giteaCredentials(env, connectionId))
    if (kind === 'gitlab') return Boolean(await gitlabCredentials(env, connectionId))
    return Boolean(await githubConnectionCredentials(env, connectionId))
  } catch { return false }
}
/** Fails closed when the configured connection was disabled or its credential cannot be decrypted. */
export async function requireGitConnection(env: ZugoidEnv, item: Pick<CodeEnvironmentConfig, 'provider' | 'gitConnectionId'>) {
  if (item.provider === 'artifacts') requireArtifacts(env)
  else if (item.provider === 'gitea') await giteaCredentials(env, item.gitConnectionId)
  else if (item.provider === 'gitlab') await gitlabCredentials(env, item.gitConnectionId)
  else if (item.gitConnectionId) await githubConnectionCredentials(env, item.gitConnectionId)
}

export type ProviderRepository = { id: number; name: string; installationId: number; fork: boolean; defaultBranch: string; resourceId: string }
export async function discoverRepositories(env: ZugoidEnv, connectionId?: string | null, transport: typeof fetch = fetch): Promise<ProviderRepository[]> {
  const kind = connectionId ? await gitConnectionProvider(env, connectionId) : 'github'
  if (connectionId && kind === 'gitea') return giteaRepositories(env, connectionId, transport)
  if (connectionId && kind === 'gitlab') return gitlabRepositories(env, connectionId, transport)
  return (await agentRepositories(env, transport, connectionId)).map(repo => ({ ...repo, resourceId: String(repo.id) }))
}

type Environment = Pick<CodeEnvironmentConfig, 'provider' | 'gitConnectionId' | 'sourceRepo' | 'sourceRepoId' | 'sourceInstallationId' | 'workRepo' | 'workRepoId' | 'workInstallationId'>
/** One repository and one operation class. GitHub mints a narrowed token; the Gitea and GitLab brokers enforce the same bounds. */
export async function repositoryClient(env: ZugoidEnv, item: Environment, side: 'source' | 'work', access: GiteaAccess, ensure: () => Promise<void> = async () => {}, transport: typeof fetch = fetch) {
  const repository = side === 'source' ? item.sourceRepo : item.workRepo
  // A Zugoid repository has no provider API: it is read through its binding and written through Git (factory-artifacts.ts).
  if (item.provider === 'artifacts') fail(409, 'artifacts_no_api', 'A repository in Zugoid has no pull requests, issues or checks')
  if (item.provider === 'gitea') {
    const client = await giteaAgentClient(env, { connectionId: item.gitConnectionId, repository, access }, ensure, transport)
    return { provider: 'gitea' as const, raw: (path: string, method?: string, body?: unknown) => client.raw(path, method, body), json: (path: string, method?: string, body?: unknown) => client.json(path, method, body), web: (path = '') => `${client.host}/${repository}${path}` }
  }
  // GitLab's API is rooted at /projects/<encoded path> (gitlab.ts): its callers build those paths themselves.
  if (item.provider === 'gitlab') {
    const client = await gitlabAgentClient(env, { connectionId: item.gitConnectionId, repository, access }, ensure, transport)
    return { provider: 'gitlab' as const, raw: (path: string, method?: string, body?: unknown) => client.raw(path, method, body), json: (path: string, method?: string, body?: unknown) => client.json(path, method, body), web: (path = '') => `${client.host}/${repository}${path}` }
  }
  const client = await githubAgentClient(env, { connectionId: item.gitConnectionId, installationId: side === 'source' ? item.sourceInstallationId : item.workInstallationId,
    repositoryId: side === 'source' ? item.sourceRepoId : item.workRepoId, access }, ensure, transport)
  return { provider: 'github' as const, raw: (path: string, method?: string, body?: unknown) => client.raw(path, method, body), json: (path: string, method?: string, body?: unknown) => client.json(path, method, body), web: (path = '') => `https://github.com/${repository}${path}` }
}
export type RepositoryClient = Awaited<ReturnType<typeof repositoryClient>>
/** Pull request pages differ only by path: GitHub /pull/N, Gitea /pulls/N, a GitLab merge request /-/merge_requests/N. */
export const pullPath = (provider: 'github' | 'gitea' | 'gitlab', number: number) => provider === 'gitlab' ? `/-/merge_requests/${number}` : provider === 'gitea' ? `/pulls/${number}` : `/pull/${number}`
/** What the provider calls a pull request, for messages. */
export const pullNoun = (provider: string) => provider === 'gitlab' ? 'merge request' : 'pull request'
export const providerLabel = (provider: string) => provider === 'gitlab' ? 'GitLab' : provider === 'gitea' ? 'Gitea' : provider === 'artifacts' ? 'Zugoid' : 'GitHub'
