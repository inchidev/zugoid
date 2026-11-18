import { z } from 'zod'
import type { AuthorizationContext } from '../../shared/authorization'
import { codeEnvironmentSchema, type CodeEnvironmentConfig } from '../../shared/code-environments'
import { hasPermission, Permission } from '../../shared/permissions'
import { projectPermissionAllowed } from '../../shared/project-access'
import type { ZugoidEnv } from '../../workers/env'
import { fail } from './cf'
import { saveCodeEnvironment } from './code-environment-service'
import { parseBody } from './validate'
import { connectionHost, gitConnectionProvider, listGitConnections } from './git-connections'
import { discoverRepositories, repositoryClient, type ProviderRepository } from './git-provider'
import { gitlabProject } from './gitlab'
import { addProjectRepository, requireProject } from './project-service'
import { artifactsAvailability } from './factory-artifacts'
import { spaceOfResource } from './space-access'

/**
 * One flow from a Project to a repository Agents can work on: pick a Git connection and a
 * repository, and the Server creates its execution configuration and attaches it. It uses
 * the same checks as Settings → Git; it only chooses sensible defaults.
 */
export const repositoryConnectSchema = z.object({
  gitConnectionId: z.string().uuid().nullable().default(null),
  repositoryId: z.number().int().positive(),
  baseBranch: z.string().trim().min(1).max(200).optional(),
  requiredChecks: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
  computeNodeId: z.string().uuid().nullable().default(null),
  previewHosts: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+$/u)).max(20).default([]),
}).strict()

export async function requireConnectAuthority(env: ZugoidEnv, auth: AuthorizationContext, projectId: string) {
  if (auth.principal.kind !== 'human' || (!auth.principal.isOwner && !hasPermission(auth.principal.permissions, Permission.manageServer))) fail(403, 'code_denied', 'Server administration is required to connect repositories')
  const project = await requireProject(env, auth, projectId, true)
  if (!projectPermissionAllowed(auth, projectId, Permission.manageProjects)) fail(403, 'project_denied', 'Manage this project to connect repositories')
  if (project.archivedAt) fail(409, 'project_archived', 'Restore the project before connecting repositories')
}

type ComputeChoice = { id: string; name: string; provider: string | null }
export async function enabledCompute(env: ZugoidEnv): Promise<ComputeChoice[]> {
  const rows = await env.DB.prepare('SELECT id,name,capabilities_json AS capabilitiesJson FROM compute_nodes WHERE enabled=1 ORDER BY created_at').all<{ id: string; name: string; capabilitiesJson: string }>()
  return rows.results.map(row => ({ id: row.id, name: row.name, provider: (JSON.parse(row.capabilitiesJson) as { provider?: string }).provider ?? null }))
}

/** What the flow needs before it starts, and what still blocks Agents from coding. */
export async function repositoryConnectOptions(env: ZugoidEnv, auth: AuthorizationContext, projectId: string) {
  await requireConnectAuthority(env, auth, projectId)
  const connections = (await listGitConnections(env)).filter(connection => connection.enabled && ['github', 'gitea', 'gitlab'].includes(connection.provider))
    .map(connection => ({ id: connection.id, provider: connection.provider, name: connection.name, host: connection.host, account: connection.account }))
  const compute = await enabledCompute(env)
  const agents = await env.DB.prepare("SELECT count(*) AS n FROM agents a JOIN users u ON u.id=a.user_id JOIN space_members m ON m.user_id=a.user_id AND m.space_id=(SELECT space_id FROM projects WHERE id=?) WHERE u.status='active' AND a.status='active' AND a.archived_at IS NULL").bind(projectId).first<{ n: number }>()
  return {
    connections,
    // A single deployment-configured GitHub App has no connection row.
    deploymentGithub: Boolean(env.GITHUB_AGENT_APP_ID && env.GITHUB_AGENT_APP_PRIVATE_KEY),
    compute,
    agents: agents?.n ?? 0,
    canConfigureCredentials: auth.principal.isOwner,
    // A repository inside Zugoid needs no connection: the Server's own Artifacts namespace holds it, where it exists.
    artifacts: artifactsAvailability(env),
  }
}

async function findRepository(env: ZugoidEnv, connectionId: string | null, repositoryId: number): Promise<ProviderRepository> {
  const repository = (await discoverRepositories(env, connectionId)).find(item => item.id === repositoryId)
  if (!repository) fail(404, 'repository_unavailable', 'This connection cannot reach that repository. Grant it access and refresh.')
  return repository
}

function environmentFor(repository: ProviderRepository, provider: 'github' | 'gitea' | 'gitlab', connectionId: string | null): Pick<CodeEnvironmentConfig, 'provider' | 'gitConnectionId' | 'sourceRepo' | 'sourceRepoId' | 'sourceInstallationId' | 'workRepo' | 'workRepoId' | 'workInstallationId'> {
  return { provider, gitConnectionId: connectionId, sourceRepo: repository.name, sourceRepoId: repository.id, sourceInstallationId: repository.installationId,
    workRepo: repository.name, workRepoId: repository.id, workInstallationId: repository.installationId }
}

/** GitLab lists a commit's statuses, one per CI job or external status, newest first by default. */
const gitlabStatusSchema = z.array(z.object({ name: z.string(), target_url: z.string().nullable().optional() }))
const gitlabCommitSchema = z.object({ id: z.string().regex(/^[a-f0-9]{40}$/u) })
const statusSchema = z.object({ statuses: z.array(z.object({ context: z.string(), target_url: z.string().nullable().optional() })).nullable().transform(value => value ?? []) })
const checkRunsSchema = z.object({ check_runs: z.array(z.object({ name: z.string() })) })

/** The registrable part of an HTTPS status link, such as vercel.app; never a code host or CI service. */
export function previewHostSuggestion(value?: string | null) {
  let url: URL
  try { url = new URL(value ?? '') } catch { return null }
  if (url.protocol !== 'https:') return null
  const host = url.hostname.toLowerCase().split('.').slice(-2).join('.')
  return /^[a-z0-9-]+\.[a-z]{2,}$/u.test(host) && !['github.com', 'githubusercontent.com', 'gitea.com', 'codeberg.org', 'gitlab.com', 'gitlab.io', 'circleci.com', 'travis-ci.com', 'buildkite.com'].includes(host) ? host : null
}

/** The checks CI reported on the base branch's latest commit: the names to require, if any. */
export async function inspectRepository(env: ZugoidEnv, auth: AuthorizationContext, projectId: string, connectionId: string | null, repositoryId: number) {
  await requireConnectAuthority(env, auth, projectId)
  const provider = await gitConnectionProvider(env, connectionId)
  const repository = await findRepository(env, connectionId, repositoryId)
  const client = await repositoryClient(env, environmentFor(repository, provider, connectionId), 'source', 'read')
  const ref = encodeURIComponent(repository.defaultBranch)
  const names = new Set<string>(), previewHosts = new Set<string>()
  // Links back to the Git host itself (CI runs on a Gitea or GitLab, for example) are not previews.
  const gitHost = provider === 'github' ? null : previewHostSuggestion(await connectionHost(env, provider, connectionId))
  try {
    if (provider === 'github') for (const run of checkRunsSchema.parse(await client.json(`/repos/${repository.name}/commits/${ref}/check-runs?per_page=100`)).check_runs) names.add(run.name)
    // GitLab finds a commit's statuses by its SHA only, never a branch name.
    const statuses = provider === 'gitlab'
      ? gitlabStatusSchema.parse(await client.json(`${gitlabProject(repository.name)}/repository/commits/${gitlabCommitSchema.parse(await client.json(`${gitlabProject(repository.name)}/repository/commits/${ref}`)).id}/statuses?per_page=100`)).map(status => ({ context: status.name, target_url: status.target_url }))
      : statusSchema.parse(await client.json(`/repos/${repository.name}/commits/${ref}/status?${provider === 'gitea' ? 'limit=50' : 'per_page=100'}`)).statuses
    for (const status of statuses) {
      names.add(status.context)
      // A deployment status links to where the commit was deployed: suggest that domain for previews.
      const host = previewHostSuggestion(status.target_url)
      if (host && host !== gitHost) previewHosts.add(host)
    }
  } catch {
    // A repository without CI or a provider without check history still connects; checks stay optional.
  }
  return { name: repository.name, defaultBranch: repository.defaultBranch, checks: [...names].sort(), previewHosts: [...previewHosts].sort() }
}

export async function connectRepository(env: ZugoidEnv, auth: AuthorizationContext, projectId: string, request: unknown) {
  await requireConnectAuthority(env, auth, projectId)
  const input = parseBody(repositoryConnectSchema, request)
  const provider = await gitConnectionProvider(env, input.gitConnectionId)
  const repository = await findRepository(env, input.gitConnectionId, input.repositoryId)
  const compute = await enabledCompute(env)
  // With one computer there is nothing to choose; with several the person picks.
  const computeNodeId = input.computeNodeId ?? (compute.length === 1 ? compute[0]!.id : null)
  if (computeNodeId && !compute.some(node => node.id === computeNodeId)) fail(400, 'compute_unavailable', 'Choose an enabled computer')
  const baseBranch = input.baseBranch ?? repository.defaultBranch
  const environment = await saveCodeEnvironment(env, auth, codeEnvironmentSchema.parse({
    ...environmentFor(repository, provider, input.gitConnectionId), name: repository.name.split('/').pop()!, computeNodeId, baseBranch, requiredChecks: input.requiredChecks, previewHosts: input.previewHosts,
  }), undefined, await spaceOfResource(env, 'project', projectId) ?? undefined)
  const host = (await connectionHost(env, provider, input.gitConnectionId))!
  const attached = await addProjectRepository(env, auth, projectId, { provider, host, externalId: String(repository.id), slug: repository.name, defaultBranch: baseBranch, environmentId: environment.id })
  return { repository: attached, environment }
}
