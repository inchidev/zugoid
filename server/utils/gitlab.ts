import { z } from 'zod'
import { gitlabConnectSchema, type GitConnection } from '../../shared/git-connections'
import { gitlabProjectPath } from '../../shared/code-environments'
import { encryptSecret, decryptSecret, type EncryptedSecret } from '../../shared/encrypted-secret'
import { getServerId } from '../../shared/server-id'
import { newId, nowIso } from '../../shared/ids'
import type { AuthorizationContext } from '../../shared/authorization'
import type { ExpectedPush } from '../../shared/git-pktline'
import type { ZugoidEnv } from '../../workers/env'
import { readLimitedStream } from '../../workers/inbound-email-signature'
import { listGitConnections, requireGitSetupOwner } from './git-connections'
import { brokeredPush, brokeredSourceFetch } from './git-smart-http'
import type { GiteaAccess } from './gitea'
import { writeAudit } from './messages'
import { fail } from './cf'

// The same scope as GitHub and Gitea connections: one encrypted credential per Server and connection.
const scope = (server: string, id: string) => `git-connection:${server}:${id}`
const user = z.object({ id: z.number().int().positive(), username: z.string().regex(/^[A-Za-z0-9_.-]{1,255}$/u) })
export type GitlabCredentials = { host: string; account: string; token: string }
/** GitLab names a project in its API by its URL-encoded path, `namespace%2Fname`. */
export const gitlabProject = (repository: string) => `/projects/${encodeURIComponent(repository)}`
/** A file or branch name as one path segment: GitLab wants every `/` in it encoded. */
export const gitlabSegment = (value: string) => encodeURIComponent(value)

async function decode(response: Response, limit = 2_000_000) {
  if (!response.ok) {
    await response.body?.cancel()
    fail(response.status === 404 ? 404 : response.status === 409 || response.status === 422 ? 409 : response.status === 401 || response.status === 403 ? 403 : 502, 'gitlab_failed', `GitLab operation failed (${response.status})`)
  }
  const body = await readLimitedStream(response.body, limit)
  if (!body.ok) fail(502, 'gitlab_response', 'GitLab response exceeds the execution limit')
  return JSON.parse(new TextDecoder().decode(body.bytes))
}
function request(credentials: Pick<GitlabCredentials, 'host' | 'token'>, path: string, init: { method?: string; body?: unknown; timeout?: number } = {}, transport: typeof fetch = fetch) {
  return transport(`${credentials.host}/api/v4${path}`, { method: init.method ?? 'GET', redirect: 'manual', signal: AbortSignal.timeout(init.timeout ?? 30000),
    headers: { 'PRIVATE-TOKEN': credentials.token, Accept: 'application/json', 'User-Agent': 'Zugoid-agent-broker', ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body) })
}

/**
 * The Owner pastes a personal, group or project access token. Zugoid checks it once against GitLab before
 * storing it encrypted. A group or project token acts as its bot user, which /user names.
 */
export async function connectGitlab(env: ZugoidEnv, actor: AuthorizationContext, input: z.input<typeof gitlabConnectSchema>, transport: typeof fetch = fetch): Promise<GitConnection> {
  requireGitSetupOwner(actor)
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) fail(503, 'git_encryption', 'Server credential encryption is unavailable')
  const { host, token, name } = gitlabConnectSchema.parse(input)
  let account: z.infer<typeof user>
  try { account = user.parse(await decode(await request({ host, token }, '/user', { timeout: 15000 }, transport), 64000)) }
  catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 403) fail(400, 'gitlab_token', 'GitLab did not accept this token. Check that it is current and has the api scope.')
    fail(502, 'gitlab_unreachable', 'GitLab did not answer at this address. Check the address and that this Server can reach it.')
  }
  // Listing projects is the minimum useful access; writes are checked when an agent first proposes code.
  try { z.array(z.unknown()).parse(await decode(await request({ host, token }, '/projects?membership=true&min_access_level=30&simple=true&per_page=1', { timeout: 15000 }, transport), 200000)) }
  catch { fail(400, 'gitlab_scope', 'This token cannot list projects. Give it the api scope and at least the Developer role.') }
  const duplicate = await env.DB.prepare("SELECT 1 FROM git_connections WHERE provider='gitlab' AND host=? AND app_id=? AND enabled=1").bind(host, String(account.id)).first()
  if (duplicate) fail(409, 'gitlab_duplicate', `${account.username} on ${new URL(host).hostname} is already connected`)
  const id = newId(), now = nowIso(), server = await getServerId(env.DB)
  const encrypted = JSON.stringify(await encryptSecret(env.AUTH_SECRET, scope(server, id), token))
  const inserted = await env.DB.prepare(`INSERT INTO git_connections(id,name,provider,host,account,app_id,app_slug,credential_json,created_by,created_at,updated_at)
    SELECT ?,?,'gitlab',?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM git_connections)<20 RETURNING id`)
    .bind(id, name || `${account.username} on ${new URL(host).hostname}`, host, account.username, String(account.id), account.username, encrypted, actor.principal.id, now, now).first()
  if (!inserted) fail(429, 'git_connection_limit', 'Git connection limit reached; disable an unused connection first')
  await writeAudit(env, { serverId: server, actorId: actor.principal.id, action: 'git.connection.create', targetType: 'git_connection', targetId: id, meta: { provider: 'gitlab', host }, authorization: actor })
  return (await listGitConnections(env)).find(c => c.id === id)!
}

/** Credentials stay inside the Server broker and never appear in connection DTOs, Agent tools or Compute Nodes. */
export async function gitlabCredentials(env: ZugoidEnv, id?: string | null): Promise<GitlabCredentials> {
  if (!id) fail(409, 'gitlab_unconfigured', 'Choose a GitLab connection for this repository')
  const row = await env.DB.prepare("SELECT host,account,credential_json AS credential FROM git_connections WHERE id=? AND provider='gitlab' AND enabled=1").bind(id).first<{ host: string; account: string; credential: string }>()
  if (!row || !env.AUTH_SECRET) fail(403, 'git_connection_revoked', 'Selected Git connection is unavailable')
  try { return { host: row.host, account: row.account, token: await decryptSecret(env.AUTH_SECRET, scope(await getServerId(env.DB), id), JSON.parse(row.credential) as EncryptedSecret) } }
  catch { fail(503, 'git_credentials', 'Selected Git connection credentials are unavailable') }
}

const project = z.object({ id: z.number().int().positive(), path_with_namespace: z.string(), archived: z.boolean().optional(), default_branch: z.string().nullable().optional(),
  empty_repo: z.boolean().optional(), forked_from_project: z.object({ id: z.number().int().positive() }).nullable().optional() })
/** Metadata-only discovery: every active project the token's user can push to (Developer or above). */
export async function gitlabRepositories(env: ZugoidEnv, connectionId: string, transport: typeof fetch = fetch) {
  const credentials = await gitlabCredentials(env, connectionId)
  const result: Array<{ id: number; name: string; installationId: number; fork: boolean; defaultBranch: string; resourceId: string }> = []
  for (let page = 1; page <= 20; page++) {
    const projects = z.array(project).parse(await decode(await request(credentials, `/projects?membership=true&min_access_level=30&archived=false&order_by=id&sort=asc&per_page=100&page=${page}`, {}, transport)))
    // An empty project has no branch to start from; a path GitLab may allow but Zugoid cannot name is left out.
    result.push(...projects.filter(item => !item.archived && !item.empty_repo && item.default_branch && gitlabProjectPath.safeParse(item.path_with_namespace).success)
      .map(item => ({ id: item.id, name: item.path_with_namespace, installationId: 0, fork: Boolean(item.forked_from_project), defaultBranch: item.default_branch!, resourceId: `gitlab:${connectionId}:${item.id}` })))
    if (projects.length < 100) break
  }
  return result
}

/** A GitLab token cannot be narrowed to one project and operation for this Server's purposes, so the broker
 * does it: callers name the project and operation class, and every request stays inside both. */
export async function gitlabAgentClient(env: ZugoidEnv, input: { connectionId?: string | null; repository: string; access: GiteaAccess },
  ensure: () => Promise<void> = async () => {}, transport: typeof fetch = fetch) {
  const credentials = await gitlabCredentials(env, input.connectionId)
  await ensure()
  const root = gitlabProject(input.repository)
  const writes: Partial<Record<GiteaAccess, RegExp>> = {
    // The Run's own branch and one commit onto it.
    work: /^\/repository\/(?:branches|commits)$/u,
    // A merge request opened from this project, then its title and description.
    pull_request: /^\/merge_requests(?:\/\d+)?$/u,
    // The Task's merge request: its title out of Draft, then its merge.
    merge: /^\/merge_requests\/\d+(?:\/merge)?$/u,
  }
  return {
    host: credentials.host,
    async raw(path: string, method = 'GET', body?: unknown) {
      // Callers supply operation-specific paths, never a model-selected URL, project or method. An encoded dot
      // segment is refused as well: a URL parser would resolve it.
      if (!(path === root || path.startsWith(root + '/') || path.startsWith(root + '?')) || path.includes('..') || /%2e/iu.test(path) || path.includes('://')) throw new Error('Invalid broker path')
      if (method !== 'GET' && method !== 'HEAD' && !writes[input.access]?.test(path.slice(root.length).split('?')[0]!)) throw new Error('Operation is outside this repository capability')
      await ensure()
      return request(credentials, path, { method, body }, transport)
    },
    async json(path: string, method = 'GET', body?: unknown) {
      return decode(await this.raw(path, method, body))
    },
  }
}

/** The clone address of a project on a connection's GitLab. */
export async function gitlabRemote(env: ZugoidEnv, connectionId: string | null | undefined, repository: string) {
  return `${(await gitlabCredentials(env, connectionId)).host}/${repository}.git`
}
/**
 * Git smart-HTTP push for one approved update of one project (git-smart-http.ts). GitLab takes an access
 * token over HTTPS as the password of the user `oauth2`; redirects are refused.
 */
export async function gitlabPush(env: ZugoidEnv, connectionId: string | null | undefined, repository: string, suffix: string, incoming: Request, expected: ExpectedPush) {
  const credentials = await gitlabCredentials(env, connectionId)
  return brokeredPush({ host: credentials.host, repository, username: 'oauth2', token: credentials.token }, suffix, incoming, expected)
}
/** Git smart-HTTP read access for one project. Only upload-pack, never receive-pack; redirects are refused. */
export async function gitlabSourceFetch(env: ZugoidEnv, connectionId: string | null | undefined, repository: string, suffix: string, incoming: Request) {
  const credentials = await gitlabCredentials(env, connectionId)
  return brokeredSourceFetch({ host: credentials.host, repository, username: 'oauth2', token: credentials.token }, suffix, incoming)
}
