import { gitConnectionProvider } from './git-connections'
import { requireEnvironmentProject } from './project-service'
import { z } from 'zod'
import { codeEnvironmentSchema, repositoryResourceId, type CodeEnvironment, type CodeEnvironmentInput, type RunEnvironment } from '../../shared/code-environments'
import { authorizeResource, resourceAllowed, type AuthorizationContext } from '../../shared/authorization'
import { hasPermission, Permission } from '../../shared/permissions'
import { anyProjectPermission, projectPermissionAllowed } from '../../shared/project-access'
import { authorize, ServerAction } from '../../shared/authorization'
import { newId, nowIso } from '../../shared/ids'
import { creationSpaceId, spaceAllowed, spaceResourceDenied, spaceSql } from '../../shared/spaces'
import type { ZugoidEnv } from '../../workers/env'
import { gitAgentConfigured, repositoryClient, requireGitConnection, type RepositoryClient } from './git-provider'
import { gitlabProject } from './gitlab'
import { artifactsCommit, requireArtifacts, withRepository } from './factory-artifacts'
import { writeAudit } from './messages'
import { fail } from './cf'

// GitHub names the root of a fork network `source`; Gitea names the direct `parent`, as GitLab does `forked_from_project`.
const repository = z.object({ id: z.number().int().positive(), full_name: z.string(), archived: z.boolean(), fork: z.boolean(), source: z.object({ id: z.number().int().positive() }).optional(), parent: z.object({ id: z.number().int().positive() }).nullable().optional() })
const gitlabRepository = z.object({ id: z.number().int().positive(), path_with_namespace: z.string(), archived: z.boolean().optional(), forked_from_project: z.object({ id: z.number().int().positive() }).nullable().optional() })
  .transform(project => ({ id: project.id, full_name: project.path_with_namespace, archived: project.archived ?? false, fork: Boolean(project.forked_from_project), source: undefined, parent: project.forked_from_project ?? null }))
const sha = z.string().regex(/^[a-f0-9]{40}$/u)
const commit = z.object({ sha, commit: z.object({ tree: z.object({ sha }) }) })
/** GitHub resolves a branch at /commits/{ref}; Gitea at /git/commits/{ref}. Both return the commit and its tree. */
export const commitPath = (provider: 'github' | 'gitea', repo: string, ref: string) => provider === 'gitea' ? `/repos/${repo}/git/commits/${encodeURIComponent(ref)}` : `/repos/${repo}/commits/${encodeURIComponent(ref)}`
/** A repository's identity, the same for each provider. */
async function repositoryMetadata(client: RepositoryClient, repo: string) {
  return client.provider === 'gitlab' ? gitlabRepository.parse(await client.json(gitlabProject(repo))) : repository.parse(await client.json(`/repos/${repo}`))
}
/** A branch's commit and tree. GitLab's API names no tree, so a GitLab tree is read by the commit itself. */
async function resolveCommit(client: RepositoryClient, repo: string, ref: string) {
  if (client.provider === 'gitlab') {
    const resolved = z.object({ id: sha }).parse(await client.json(`${gitlabProject(repo)}/repository/commits/${encodeURIComponent(ref)}`))
    return { sha: resolved.id, treeSha: resolved.id }
  }
  const resolved = commit.parse(await client.json(commitPath(client.provider, repo, ref)))
  // Forgejo names the commit itself as its tree here; its trees endpoint, like Gitea's, lists a commit's tree too.
  return { sha: resolved.sha, treeSha: resolved.commit.tree.sha }
}
export async function findCodeEnvironment(env: ZugoidEnv, id: string): Promise<CodeEnvironment | null> {
  const row = await env.DB.prepare('SELECT id,config_json as configJson,enabled,version FROM agent_environments WHERE id=?').bind(id)
    .first<{ id: string; configJson: string; enabled: number; version: number }>()
  if (!row) return null
  return { ...codeEnvironmentSchema.parse(JSON.parse(row.configJson)), id: row.id, enabled: Boolean(row.enabled), version: row.version }
}
export async function listCodeEnvironments(env: ZugoidEnv, auth: AuthorizationContext) {
  const global = auth.principal.isOwner || hasPermission(auth.principal.permissions, Permission.useComputer) || hasPermission(auth.principal.permissions, Permission.manageServer) || hasPermission(auth.principal.permissions, Permission.manageRoles)
  if (!global && !anyProjectPermission(auth, Permission.useComputer)) fail(403, 'code_denied', 'Computer access is not granted')
  const rows = await env.DB.prepare(`SELECT id FROM agent_environments WHERE space_id IN (${spaceSql(auth)}) ORDER BY created_at`).all<{ id: string }>()
  const visible = []
  for (const row of rows.results ?? []) {
    const item = await findCodeEnvironment(env, row.id)
    const link = item ? await env.DB.prepare('SELECT project_id AS id FROM project_repositories WHERE environment_id=?').bind(item.id).first<{ id: string }>() : null
    const scoped = item && link && projectPermissionAllowed(auth, link.id, Permission.useComputer, { kind: 'repositories', id: repositoryResourceId(item) })
    if (item && (scoped || (global && resourceAllowed(auth, 'repositories', repositoryResourceId(item))))) {
      try { await requireEnvironmentProject(env, auth, item.id); visible.push(item) } catch { /* Project scope can narrow repository visibility. */ }
    }
  }
  return visible
}
/** `targetSpace` places a new configuration with the Project it is being attached to. */
export async function saveCodeEnvironment(env: ZugoidEnv, auth: AuthorizationContext, request: CodeEnvironmentInput, id?: string, targetSpace?: string) {
  if (auth.principal.kind !== 'human' || (!auth.principal.isOwner && !hasPermission(auth.principal.permissions, Permission.manageServer))) fail(403, 'code_denied', 'Server administration is required')
  const spaceId = targetSpace ?? creationSpaceId(auth)
  if (!id && (!spaceId || !spaceAllowed(auth, spaceId))) fail(403, 'forbidden', 'Choose a Space first')
  // The provider follows the chosen connection, never the request; a repository in Zugoid has none, and its binding must be there.
  const provider = request.provider === 'artifacts' ? 'artifacts' as const : await gitConnectionProvider(env, request.gitConnectionId)
  if (provider === 'artifacts') requireArtifacts(env)
  const input = codeEnvironmentSchema.parse({ ...request, provider })
  authorizeResource(auth, 'repositories', repositoryResourceId(input))
  const existing = id ? await findCodeEnvironment(env, id) : null
  if (id && (!existing || spaceResourceDenied(auth, 'environments', id))) fail(404, 'not_found', 'Environment not found')
  if (existing) {
    await requireEnvironmentProject(env, auth, existing.id)
    const linked = await env.DB.prepare('SELECT external_id AS externalId,slug,default_branch AS defaultBranch FROM project_repositories WHERE environment_id=?').bind(existing.id).first<{ externalId: string; slug: string; defaultBranch: string }>()
    if (linked && (existing.provider !== input.provider || ((input.provider === 'gitea' || input.provider === 'gitlab') && existing.gitConnectionId !== input.gitConnectionId) || linked.externalId !== (input.provider === 'artifacts' ? input.repositoryId : String(input.sourceRepoId)) || linked.slug.toLowerCase() !== input.sourceRepo.toLowerCase() || linked.defaultBranch !== input.baseBranch)) fail(409, 'project_repository_changed', 'Detach the project reference before changing repository identity or base branch')
  }
  if (existing) authorizeResource(auth, 'repositories', repositoryResourceId(existing))
  if (provider === 'artifacts') {
    // The repository must be the one the binding knows under that name, with a real base commit.
    const info = await withRepository(env, input.sourceRepo, repo => repo.info()).catch(() => null)
    if (!info || info.id !== input.repositoryId || info.remote !== input.remote) fail(400, 'code_repository', 'This repository is not in this Server')
    await artifactsCommit(env, input.sourceRepo, input.baseBranch)
  } else {
  const sourceClient = await repositoryClient(env, input, 'source', 'read')
  const workClient = await repositoryClient(env, input, 'work', 'read')
  const source = await repositoryMetadata(sourceClient, input.sourceRepo)
  const work = await repositoryMetadata(workClient, input.workRepo)
  if (source.id !== input.sourceRepoId || work.id !== input.workRepoId || source.full_name.toLowerCase() !== input.sourceRepo.toLowerCase()
    || work.full_name.toLowerCase() !== input.workRepo.toLowerCase() || source.archived || work.archived
    || (source.id !== work.id && (!work.fork || (provider === 'gitea' || provider === 'gitlab' ? work.parent?.id !== source.id : work.source?.id !== (source.source?.id ?? source.id))))) fail(400, 'code_repository', 'Choose the same active repository or an active fork from the same repository network')
  // Resolve a real base commit before accepting this configuration.
  await resolveCommit(sourceClient, input.sourceRepo, input.baseBranch)
  }
  const environmentId = existing?.id ?? newId()
  const now = nowIso()
  const config = JSON.stringify(input)
  if (existing) { const updated = await env.DB.prepare('UPDATE agent_environments SET config_json=?,enabled=1,version=version+1,updated_at=? WHERE id=? AND version=?')
    .bind(config, now, environmentId, existing.version).run()
    if (!updated.meta.changes) fail(409, 'code_environment_changed', 'Environment changed while it was being saved')
  }
  else await env.DB.prepare('INSERT INTO agent_environments(id,space_id,config_json,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?)')
    .bind(environmentId, spaceId, config, auth.principal.id, now, now).run()
  await writeAudit(env, { serverId: auth.serverId, actorId: auth.principal.id, action: 'agent.environment.configure', targetType: 'environment', targetId: environmentId,
    meta: { provider, sourceRepo: input.sourceRepo, workRepo: input.workRepo }, authorization: auth })
  return (await findCodeEnvironment(env, environmentId))!
}
export async function disableCodeEnvironment(env: ZugoidEnv, auth: AuthorizationContext, id: string) {
  if (auth.principal.kind !== 'human' || (!auth.principal.isOwner && !hasPermission(auth.principal.permissions, Permission.manageServer))) fail(403, 'code_denied', 'Server administration is required')
  const item = await findCodeEnvironment(env, id)
  if (!item || spaceResourceDenied(auth, 'environments', id)) fail(404, 'not_found', 'Environment not found')
  await requireEnvironmentProject(env, auth, item.id)
  authorizeResource(auth, 'repositories', repositoryResourceId(item))
  await env.DB.prepare('UPDATE agent_environments SET enabled=0,version=version+1,updated_at=? WHERE id=?').bind(nowIso(), id).run()
}
export async function admitRunEnvironment(env: ZugoidEnv, auth: AuthorizationContext, id: string): Promise<RunEnvironment> {
  authorize(auth, ServerAction.useComputer)
  const item = await findCodeEnvironment(env, id)
  if (!item?.enabled || spaceResourceDenied(auth, 'environments', id)) fail(403, 'code_revoked', 'Repository environment is unavailable')
  if (!await gitAgentConfigured(env, item.gitConnectionId, item.provider)) fail(409, 'git_unconfigured', item.provider === 'artifacts' ? 'Repositories in Zugoid are unavailable on this Server' : 'Connect GitHub, GitLab or Gitea in Server settings')
  await requireEnvironmentProject(env, auth, item.id)
  authorizeResource(auth, 'repositories', repositoryResourceId(item))
  if (item.provider === 'artifacts') {
    const base = await artifactsCommit(env, item.sourceRepo, item.baseBranch)
    return { ...item, baseSha: base.sha, baseTreeSha: base.treeSha }
  }
  const client = await repositoryClient(env, item, 'source', 'read')
  const base = await resolveCommit(client, item.sourceRepo, item.baseBranch)
  return { ...item, baseSha: base.sha, baseTreeSha: base.treeSha }
}
export async function requireRunEnvironment(env: ZugoidEnv, auth: AuthorizationContext, snapshot: RunEnvironment) {
  authorize(auth, ServerAction.useComputer)
  const current = await findCodeEnvironment(env, snapshot.id)
  if (!current?.enabled || current.version !== snapshot.version || spaceResourceDenied(auth, 'environments', snapshot.id)) fail(403, 'code_revoked', 'Repository environment was changed or disabled')
  await requireGitConnection(env, current)
  await requireEnvironmentProject(env, auth, snapshot.id)
  authorizeResource(auth, 'repositories', repositoryResourceId(snapshot))
  return snapshot
}
