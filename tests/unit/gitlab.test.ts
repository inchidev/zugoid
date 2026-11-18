import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ids, mcpFixture } from '../helpers/outbound-mcp'
import { codeEnvironmentSchema, repositoryResourceId, type RunEnvironment } from '../../shared/code-environments'
import { gitlabConnectSchema } from '../../shared/git-connections'
import { disableGitConnection, listGitConnections } from '../../server/utils/git-connections'
import { connectGitlab, gitlabAgentClient, gitlabCredentials, gitlabPush, gitlabRemote, gitlabRepositories, gitlabSourceFetch } from '../../server/utils/gitlab'
import { discoverRepositories, gitAgentConfigured, pullPath, repositoryClient } from '../../server/utils/git-provider'
import { brokerRemote, tokenBrokered } from '../../server/utils/git-broker'
import { gitlabMergeRequest, publishGitlabProposal } from '../../server/utils/gitlab-proposal'
import { gitlabFactoryFeedback, gitlabPublishedPull, gitlabState } from '../../server/utils/factory-gitlab'
import { fastForwarded } from '../../server/utils/factory-github'
import { codeProposalChecks, codeRepositoryArchive, readCodeFile, readCodeTree } from '../../server/utils/agent-code-service'
import { readGithubIssue, readGithubPullRequest, readGithubRepository } from '../../server/utils/agent-github-context'
import { ALL_PERMISSIONS } from '../../shared/permissions'

const host = 'https://gitlab.example.test', token = 'glpat-' + 'a'.repeat(20)
let f: ReturnType<typeof mcpFixture>
beforeEach(() => { f = mcpFixture() })
afterEach(() => { f.db.close(); vi.unstubAllGlobals() })
const account = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
  expect(new Headers(init?.headers).get('PRIVATE-TOKEN')).toBe(token)
  expect(new Headers(init?.headers).get('Authorization')).toBeNull()
  expect(init?.redirect).toBe('manual')
  if (String(url) === `${host}/api/v4/user`) return Response.json({ id: 7, username: 'zugoid-bot', bot: false })
  if (String(url) === `${host}/api/v4/projects?membership=true&min_access_level=30&simple=true&per_page=1`) return Response.json([])
  return new Response('unexpected', { status: 500 })
})
const connect = async () => connectGitlab(f.env, await f.actor(), { host, token }, account)
const environment = (connection: string, extra: Partial<RunEnvironment> = {}) => ({ ...codeEnvironmentSchema.parse({ provider: 'gitlab', gitConnectionId: connection, name: 'App', sourceRepo: 'team/web/app', sourceRepoId: 11, sourceInstallationId: 0,
  workRepo: 'team/web/app', workRepoId: 11, workInstallationId: 0, baseBranch: 'main', requiredChecks: ['test'], previewHosts: ['pages.dev'] }), id: ids.server, enabled: true, version: 1, baseSha: 'b'.repeat(40), baseTreeSha: 'b'.repeat(40), ...extra }) satisfies RunEnvironment
const api = (url: string | URL | Request) => { const parsed = new URL(String(url)); return { path: parsed.pathname.replace('/api/v4', ''), query: parsed.searchParams } }
const mergeRequest = (extra: Record<string, unknown> = {}) => ({ iid: 5, state: 'opened', title: 'Draft: Fix', description: 'Body', draft: true, sha: 'c'.repeat(40), source_branch: 'zugoid-agent/run', target_branch: 'main',
  source_project_id: 11, target_project_id: 11, detailed_merge_status: 'draft_status', diff_refs: { base_sha: 'b'.repeat(40), head_sha: 'c'.repeat(40) }, ...extra })

it('accepts only an HTTPS GitLab origin and a token-shaped secret', () => {
  expect(gitlabConnectSchema.parse({ host: 'https://gitlab.com/', token }).host).toBe('https://gitlab.com')
  for (const bad of ['http://gitlab.example.test', 'https://u:p@gitlab.example.test', 'https://gitlab.example.test/gitlab', 'https://gitlab.example.test/?x=1', 'gitlab.example.test'])
    expect(gitlabConnectSchema.safeParse({ host: bad, token }).success, bad).toBe(false)
  expect(gitlabConnectSchema.safeParse({ host, token: 'short' }).success).toBe(false)
  expect(gitlabConnectSchema.safeParse({ host, token: 'glpat-abc def ghi jkl mno pqr' }).success).toBe(false)
})
it('connects an Owner-provided token, stores it encrypted and never returns it', async () => {
  await expect(connectGitlab(f.env, await f.actor(ids.member), { host, token }, account)).rejects.toMatchObject({ statusCode: 403 })
  const connection = await connect()
  expect(connection).toMatchObject({ provider: 'gitlab', host, account: 'zugoid-bot', appId: '7', enabled: true, setupUrl: `${host}/zugoid-bot`, name: 'zugoid-bot on gitlab.example.test' })
  const stored = String(f.db.prepare('SELECT credential_json AS secret FROM git_connections WHERE id=?').get(connection.id)!.secret)
  expect(stored).not.toContain(token)
  expect(JSON.stringify(await listGitConnections(f.env))).not.toContain(token)
  const audit = JSON.stringify(f.db.prepare("SELECT meta_json FROM audit_log WHERE action='git.connection.create'").all())
  expect(audit).not.toContain(token)
  expect(audit).toContain('gitlab')
  expect(await gitlabCredentials(f.env, connection.id)).toEqual({ host, account: 'zugoid-bot', token })
  await expect(connect()).rejects.toMatchObject({ statusCode: 409 })
})
it('refuses a token GitLab rejects or one that cannot list projects', async () => {
  await expect(connectGitlab(f.env, await f.actor(), { host, token }, vi.fn(async () => new Response('', { status: 401 })))).rejects.toMatchObject({ statusCode: 400 })
  await expect(connectGitlab(f.env, await f.actor(), { host, token }, vi.fn(async (url: string | URL | Request) => String(url).endsWith('/user') ? Response.json({ id: 7, username: 'zugoid-bot' }) : new Response('', { status: 403 })))).rejects.toMatchObject({ statusCode: 400 })
  await expect(connectGitlab(f.env, await f.actor(), { host, token }, vi.fn(async () => new Response(null, { status: 302, headers: { Location: 'https://elsewhere.test' } })))).rejects.toMatchObject({ statusCode: 502 })
  expect(await listGitConnections(f.env)).toEqual([])
})
it('discovers only active projects it can push to, subgroups included, with GitLab-scoped resource IDs', async () => {
  const connection = await connect()
  const remote = vi.fn(async (url: string | URL | Request) => {
    expect(String(url)).toBe(`${host}/api/v4/projects?membership=true&min_access_level=30&archived=false&order_by=id&sort=asc&per_page=100&page=1`)
    return Response.json([
      { id: 11, path_with_namespace: 'team/web/app', archived: false, default_branch: 'main', empty_repo: false },
      { id: 12, path_with_namespace: 'team/old', archived: true, default_branch: 'main' },
      { id: 13, path_with_namespace: 'team/empty', archived: false, default_branch: null, empty_repo: true },
      { id: 14, path_with_namespace: 'me/app-fork', archived: false, default_branch: 'trunk', forked_from_project: { id: 11 } },
    ])
  })
  expect(await gitlabRepositories(f.env, connection.id, remote)).toEqual([
    { id: 11, name: 'team/web/app', installationId: 0, fork: false, defaultBranch: 'main', resourceId: `gitlab:${connection.id}:11` },
    { id: 14, name: 'me/app-fork', installationId: 0, fork: true, defaultBranch: 'trunk', resourceId: `gitlab:${connection.id}:14` },
  ])
  expect(await discoverRepositories(f.env, connection.id, remote)).toHaveLength(2)
  expect(await gitAgentConfigured(f.env, connection.id)).toBe(true)
  expect(await gitAgentConfigured(f.env)).toBe(true)
  await disableGitConnection(f.env, await f.actor(), connection.id)
  expect(await gitAgentConfigured(f.env, connection.id)).toBe(false)
  await expect(gitlabCredentials(f.env, connection.id)).rejects.toMatchObject({ statusCode: 403 })
})
it('keeps GitLab repository scopes apart and names projects with their full namespace', () => {
  const base = { name: 'App', sourceRepo: 'team/web/app', sourceRepoId: 11, workRepo: 'team/web/app', workRepoId: 11, baseBranch: 'main' }
  const gitlab = codeEnvironmentSchema.parse({ ...base, provider: 'gitlab', gitConnectionId: ids.server, sourceInstallationId: 0, workInstallationId: 0 })
  expect(repositoryResourceId(gitlab)).toBe(`gitlab:${ids.server}:11`)
  expect(repositoryResourceId({ ...gitlab, provider: 'gitea' })).toBe(`gitea:${ids.server}:11`)
  expect(codeEnvironmentSchema.safeParse({ ...base, provider: 'gitlab', gitConnectionId: null, sourceInstallationId: 0, workInstallationId: 0 }).success).toBe(false)
  expect(codeEnvironmentSchema.safeParse({ ...base, provider: 'gitlab', gitConnectionId: ids.server, sourceInstallationId: 3, workInstallationId: 3 }).success).toBe(false)
  // Only GitLab has subgroups; a path with a dot segment is never a project.
  expect(codeEnvironmentSchema.safeParse({ ...base, provider: 'gitea', gitConnectionId: ids.server, sourceInstallationId: 0, workInstallationId: 0 }).success).toBe(false)
  expect(codeEnvironmentSchema.safeParse({ ...base, provider: 'gitlab', gitConnectionId: ids.server, sourceInstallationId: 0, workInstallationId: 0, sourceRepo: 'team/../app', workRepo: 'team/../app' }).success).toBe(false)
  expect(tokenBrokered('gitlab') && tokenBrokered('gitea') && !tokenBrokered('github') && !tokenBrokered('artifacts')).toBe(true)
})
it('confines the broker to one project, by its encoded path, and its operation class', async () => {
  const connection = await connect()
  const remote = vi.fn(async () => Response.json({}))
  const root = '/projects/team%2Fweb%2Fapp'
  const reader = await gitlabAgentClient(f.env, { connectionId: connection.id, repository: 'team/web/app', access: 'read' }, undefined, remote)
  await reader.json(`${root}/repository/files/README.md?ref=main`)
  await reader.raw(`${root}/repository/files/docs%2Fa.md?ref=main`, 'HEAD')
  for (const path of ['/projects/team%2Fother', `${root}-evil`, `${root}/../other`, `${root}/%2e%2e/%2E%2E/projects/team%2Fother`, '/projects/11', 'https://gitlab.example.test/api/v4/projects/team%2Fweb%2Fapp'])
    await expect(reader.raw(path), path).rejects.toThrow('Invalid broker path')
  await expect(reader.raw(`${root}/repository/commits`, 'POST', {})).rejects.toThrow('outside this repository capability')
  const writer = await gitlabAgentClient(f.env, { connectionId: connection.id, repository: 'team/web/app', access: 'work' }, undefined, remote)
  await writer.json(`${root}/repository/commits`, 'POST', {})
  await writer.json(`${root}/repository/branches`, 'POST', {})
  await expect(writer.raw(`${root}/merge_requests`, 'POST', {})).rejects.toThrow('outside this repository capability')
  await expect(writer.raw(`${root}/repository/branches/main`, 'DELETE')).rejects.toThrow('outside this repository capability')
  await expect(writer.raw(root, 'PUT', {})).rejects.toThrow('outside this repository capability')
  const merger = await gitlabAgentClient(f.env, { connectionId: connection.id, repository: 'team/web/app', access: 'merge' }, undefined, remote)
  await merger.json(`${root}/merge_requests/5/merge`, 'PUT', {})
  await expect(merger.raw(`${root}/merge_requests/5/approve`, 'POST', {})).rejects.toThrow('outside this repository capability')
  expect(remote).toHaveBeenCalledTimes(5)
  expect(String(remote.mock.calls[0]![0])).toBe(`${host}/api/v4${root}/repository/files/README.md?ref=main`)
})
it('serves Git source read-only as oauth2 with the token and never follows a redirect', async () => {
  const connection = await connect()
  expect(await gitlabRemote(f.env, connection.id, 'team/web/app')).toBe(`${host}/team/web/app.git`)
  expect(await brokerRemote(f.env, environment(connection.id))).toBe(`${host}/team/web/app.git`)
  const upstream = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    expect(new Headers(init?.headers).get('Authorization')).toBe('Basic ' + btoa(`oauth2:${token}`))
    return String(url).includes('redirect') ? new Response(null, { status: 302, headers: { Location: 'https://elsewhere.test' } }) : new Response('refs', { headers: { 'content-type': 'application/x-git-upload-pack-advertisement' } })
  })
  vi.stubGlobal('fetch', upstream)
  const refs = await gitlabSourceFetch(f.env, connection.id, 'team/web/app', '/info/refs', new Request('https://server.test/x/info/refs?service=git-upload-pack'))
  expect(await refs.text()).toBe('refs')
  expect(String(upstream.mock.calls[0]![0])).toBe(`${host}/team/web/app.git/info/refs?service=git-upload-pack`)
  expect((await gitlabSourceFetch(f.env, connection.id, 'team/web/app', '/info/refs', new Request('https://server.test/x/info/refs?service=git-receive-pack'))).status).toBe(403)
  expect((await gitlabSourceFetch(f.env, connection.id, 'team/web/app', '/git-receive-pack', new Request('https://server.test/x/git-receive-pack', { method: 'POST', body: 'x' }))).status).toBe(403)
  expect((await gitlabSourceFetch(f.env, connection.id, 'team/redirect', '/info/refs', new Request('https://server.test/x/info/refs?service=git-upload-pack'))).status).toBe(502)
  expect(upstream).toHaveBeenCalledTimes(2)
})
it('forwards a push to GitLab only for the one approved update, adding the token itself', async () => {
  const connection = await connect()
  const ref = 'refs/heads/zugoid-agent/00000000-0000-4000-8000-0000000000c1', sha = 'c'.repeat(40), zero = '0'.repeat(40)
  const pkt = (line: string) => (line.length + 4).toString(16).padStart(4, '0') + line
  const body = (command: string) => pkt(command + '\0report-status side-band-64k\n') + '0000PACK'
  const forwarded: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    expect(new Headers(init?.headers).get('Authorization')).toBe('Basic ' + btoa(`oauth2:${token}`))
    forwarded.push(String(url) + ' ' + (init?.body ? await new Response(init.body as BodyInit).text() : ''))
    return new Response('ok', { headers: { 'content-type': 'application/x-git-receive-pack-result' } })
  }))
  const post = (text: string) => new Request('https://server.test/x/git-receive-pack', { method: 'POST', body: text, duplex: 'half' } as RequestInit)
  expect((await gitlabPush(f.env, connection.id, 'team/web/app', '/info/refs', new Request('https://server.test/x/info/refs?service=git-receive-pack'), { ref, sha })).status).toBe(200)
  expect((await gitlabPush(f.env, connection.id, 'team/web/app', '/git-receive-pack', post(body(`${zero} ${sha} ${ref}`)), { ref, sha })).status).toBe(200)
  expect(forwarded).toEqual([`${host}/team/web/app.git/info/refs?service=git-receive-pack `, `${host}/team/web/app.git/git-receive-pack ${body(`${zero} ${sha} ${ref}`)}`])
  for (const command of [`${zero} ${sha} refs/heads/main`, `${zero} ${'d'.repeat(40)} ${ref}`, `${sha} ${zero} ${ref}`])
    expect((await gitlabPush(f.env, connection.id, 'team/web/app', '/git-receive-pack', post(body(command)), { ref, sha })).status, command).toBe(403)
  expect((await gitlabPush(f.env, connection.id, 'team/web/app', '/info/refs', new Request('https://server.test/x/info/refs?service=git-upload-pack'), { ref, sha })).status).toBe(403)
  expect(forwarded).toHaveLength(2)
})
it('reads a merge request in the shape of a pull request', () => {
  const mr = gitlabMergeRequest.parse(mergeRequest())
  expect(mr).toMatchObject({ number: 5, state: 'open', merged: false, draft: true, body: 'Body', head: { ref: 'zugoid-agent/run', sha: 'c'.repeat(40), repo: { id: 11 } }, base: { ref: 'main', repo: { id: 11 } } })
  expect(gitlabMergeRequest.parse(mergeRequest({ state: 'merged', draft: false })).merged).toBe(true)
  expect(pullPath('gitlab', 5)).toBe('/-/merge_requests/5')
})
it('publishes a proposal on a Run branch started at the admitted base and opens a Draft merge request', async () => {
  const connection = await connect()
  const item = environment(connection.id), base = item.baseSha, commit = 'c'.repeat(40)
  let branch: string | null = null
  const calls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const { path, query } = api(url), method = init?.method ?? 'GET'
    calls.push(`${method} ${path}`)
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    const root = '/projects/team%2Fweb%2Fapp'
    if (path === `${root}/repository/branches/zugoid-agent%2Frun`) return branch ? Response.json({ name: 'zugoid-agent/run', commit: { id: branch } }) : Response.json({ message: '404 Branch Not Found' }, { status: 404 })
    if (path === `${root}/repository/branches` && method === 'POST') { expect(body).toEqual({ branch: 'zugoid-agent/run', ref: base }); branch = base; return Response.json({}) }
    if (path === `${root}/repository/files/README.md` && method === 'HEAD') { expect(query.get('ref')).toBe('zugoid-agent/run'); return new Response(null, { status: 200 }) }
    if (path === `${root}/repository/files/bin%2Frun.sh` && method === 'HEAD') return new Response(null, { status: 404 })
    if (path === `${root}/repository/files/gone.txt` && method === 'HEAD') return new Response(null, { status: 404 })
    if (path === `${root}/repository/commits` && method === 'POST') {
      expect(body.branch).toBe('zugoid-agent/run')
      expect(body.commit_message).toBe('Fix\n\nZugoid-Run: run')
      expect(body.actions).toEqual([
        { action: 'update', file_path: 'README.md', content: Buffer.from('Привет').toString('base64'), encoding: 'base64', execute_filemode: false },
        { action: 'create', file_path: 'bin/run.sh', content: btoa('echo'), encoding: 'base64', execute_filemode: true },
      ])
      branch = commit
      return Response.json({ id: commit, parent_ids: [base] })
    }
    if (path === `${root}/merge_requests` && method === 'GET') { expect(Object.fromEntries(query)).toEqual({ source_branch: 'zugoid-agent/run', target_branch: 'main', per_page: '100' }); return Response.json([]) }
    if (path === `${root}/merge_requests` && method === 'POST') { expect(body).toEqual({ title: 'Draft: Fix', description: 'Body', source_branch: 'zugoid-agent/run', target_branch: 'main', remove_source_branch: false }); return Response.json(mergeRequest()) }
    return new Response(`unexpected ${method} ${path}`, { status: 500 })
  }))
  const recorded: string[] = []
  const files = [{ path: 'README.md', content: 'Привет', executable: false }, { path: 'bin/run.sh', content: 'echo', executable: true }, { path: 'gone.txt', content: null, executable: false }]
  const result = await publishGitlabProposal(f.env, { runId: 'run', environment: item, input: { title: 'Fix', body: '', files },
    description: 'Body', branch: 'zugoid-agent/run', proposal: { commitSha: null, publishedCommitSha: null, pullNumber: null }, ensure: async () => {}, recordCommit: async sha => { recorded.push(sha) } })
  expect(result).toEqual({ number: 5, url: `${host}/team/web/app/-/merge_requests/5`, commit })
  expect(recorded).toEqual([commit])
  expect(calls.some(call => call.startsWith('PUT '))).toBe(false)
  // A branch moved outside the Run is never written over.
  branch = 'e'.repeat(40)
  await expect(publishGitlabProposal(f.env, { runId: 'run', environment: item, input: { title: 'Fix', body: '', files: [{ path: 'README.md', content: 'again', executable: false }] },
    description: 'Body', branch: 'zugoid-agent/run', proposal: { commitSha: null, publishedCommitSha: commit, pullNumber: null }, ensure: async () => {}, recordCommit: async () => {} })).rejects.toMatchObject({ statusCode: 409 })
  const client = await repositoryClient(f.env, item, 'source', 'read')
  expect(client.web(pullPath('gitlab', 5))).toBe(`${host}/team/web/app/-/merge_requests/5`)
})
it('opens the Task’s Draft merge request after a push, only at the approved head', async () => {
  const connection = await connect()
  const item = environment(connection.id), sha = 'c'.repeat(40)
  const writes: Array<{ method: string; body: Record<string, unknown> }> = []
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const { path } = api(url), method = init?.method ?? 'GET', body = init?.body ? JSON.parse(String(init.body)) : {}
    if (method !== 'GET') writes.push({ method, body })
    if (path === '/projects/team%2Fweb%2Fapp/merge_requests' && method === 'GET') return Response.json([mergeRequest({ source_project_id: 99 })])
    if (path === '/projects/team%2Fweb%2Fapp/merge_requests' && method === 'POST') return Response.json(mergeRequest({ iid: 6 }))
    if (path === '/projects/team%2Fweb%2Fapp/merge_requests/6' && method === 'PUT') return Response.json(mergeRequest({ iid: 6 }))
    return new Response(`unexpected ${method} ${path}`, { status: 500 })
  }))
  const receipt = await gitlabPublishedPull(f.env, item, { branch: 'zugoid-agent/run', sha, prior: null, title: 'Fix', description: 'Body', ensure: async () => {} })
  expect(receipt).toEqual({ number: 6, commit: sha, branch: 'zugoid-agent/run', url: `${host}/team/web/app/-/merge_requests/6` })
  expect(writes).toEqual([{ method: 'POST', body: { title: 'Draft: Fix', description: 'Body', source_branch: 'zugoid-agent/run', target_branch: 'main', remove_source_branch: false } }, { method: 'PUT', body: { title: 'Draft: Fix', description: 'Body' } }])
})
it('reads checks from the head pipeline and each job’s status, and a job’s log from GitLab', async () => {
  const connection = await connect()
  const item = environment(connection.id), sha = 'c'.repeat(40)
  let statuses = [
    { id: 41, name: 'test', status: 'success', allow_failure: false, target_url: `${host}/team/web/app/-/jobs/41` },
    { id: 42, name: 'lint', status: 'failed', allow_failure: true, target_url: `${host}/team/web/app/-/jobs/42` },
    { id: 900, name: 'deploy', status: 'success', target_url: 'https://app-mr-5.pages.dev/' },
  ]
  let pipeline = 'success'
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const { path, query } = api(url)
    if (path === '/projects/team%2Fweb%2Fapp/merge_requests/5') return Response.json(mergeRequest({ detailed_merge_status: 'mergeable', head_pipeline: { id: 3, sha, status: pipeline, web_url: `${host}/team/web/app/-/pipelines/3` } }))
    if (path === `/projects/team%2Fweb%2Fapp/repository/commits/${sha}/statuses`) return Response.json(query.get('page') === '1' ? statuses : [])
    if (path === '/projects/team%2Fweb%2Fapp/jobs/41/trace') return new Response('all tests passed')
    if (path === '/projects/team%2Fweb%2Fapp/repository/merge_base') { expect(query.getAll('refs[]')).toEqual(['b'.repeat(40), sha]); return Response.json({ id: 'b'.repeat(40) }) }
    return new Response(`unexpected ${init?.method ?? 'GET'} ${path}`, { status: 500 })
  }))
  const receipt = { number: 5, commit: sha, branch: 'zugoid-agent/run', url: '' }
  const feedback = await gitlabFactoryFeedback(f.env, { environment: item, receipt, jobId: 41, ensure: async () => {} })
  expect(feedback).toMatchObject({ state: 'success', readyForReview: true, complete: true, providerMergeState: 'clean',
    checks: [{ name: 'pipeline', state: 'success' }, { name: 'test', state: 'success' }, { name: 'lint', state: 'skipped' }, { name: 'deploy', state: 'success' }],
    jobs: [{ id: 41, name: 'test' }, { id: 42, name: 'lint' }], required: [{ name: 'test', state: 'success' }], previews: [{ url: 'https://app-mr-5.pages.dev/', source: 'deploy' }],
    log: { jobId: 41, content: 'all tests passed', truncated: false } })
  // A status set by an outside service is no job: its log cannot be read through GitLab.
  await expect(gitlabFactoryFeedback(f.env, { environment: item, receipt, jobId: 900, ensure: async () => {} })).rejects.toMatchObject({ statusCode: 403 })
  pipeline = 'running'; statuses = [{ ...statuses[0]!, status: 'running' }]
  expect(await gitlabFactoryFeedback(f.env, { environment: item, receipt, ensure: async () => {} })).toMatchObject({ state: 'running', readyForReview: false })
  pipeline = 'failed'; statuses = [{ ...statuses[0]!, status: 'failed' }]
  expect(await gitlabFactoryFeedback(f.env, { environment: item, receipt, ensure: async () => {} })).toMatchObject({ state: 'failure', readyForReview: false })
  await expect(gitlabFactoryFeedback(f.env, { environment: item, receipt: { ...receipt, commit: 'd'.repeat(40) }, ensure: async () => {} })).rejects.toMatchObject({ statusCode: 409 })
  expect(await fastForwarded(f.env, item, 'b'.repeat(40), sha, async () => {})).toBe(true)
  expect([gitlabState('manual'), gitlabState('manual', true), gitlabState('canceled'), gitlabState('pending')]).toEqual(['queued', 'skipped', 'failure', 'queued'])
})

describe('a Task’s Run on a GitLab project', () => {
  const sha = 'a'.repeat(40), head = 'f'.repeat(40), root = '/projects/team%2Fweb%2Fapp'
  let runId: string, stored: Map<string, Uint8Array>, calls: string[]
  beforeEach(async () => {
    const connection = await connect()
    f.db.prepare('UPDATE roles SET permissions_bitmask=? WHERE id=?').run(ALL_PERMISSIONS, ids.agentRole)
    const config = { provider: 'gitlab', gitConnectionId: connection.id, name: 'App', sourceRepo: 'team/web/app', sourceRepoId: 11, sourceInstallationId: 0, workRepo: 'team/web/app', workRepoId: 11, workInstallationId: 0, baseBranch: 'main', requiredChecks: ['test'], previewHosts: ['pages.dev'] }
    f.db.prepare("INSERT INTO agent_environments(id,config_json,created_by,created_at,updated_at) VALUES('gitlab-env',?,?,'2026-11-01','2026-11-01')").run(JSON.stringify(config), ids.owner)
    f.db.prepare("INSERT INTO task_boards(id,name,created_by) VALUES('gitlab-board','Code',?)").run(ids.owner)
    f.db.prepare("INSERT INTO tasks(id,board_id,title,assignee_id,environment_id,created_by,status) VALUES('gitlab-task','gitlab-board','Fix',?,'gitlab-env',?,'ready')").run(ids.agent, ids.owner)
    stored = new Map(); calls = []
    f.env.FILES = { get: vi.fn(async (key: string) => { const bytes = stored.get(key); return bytes ? { size: bytes.length, body: new Blob([new Uint8Array(bytes)]).stream() } : null }), put: vi.fn(async (key: string, bytes: Uint8Array) => { stored.set(key, bytes) }) } as unknown as typeof f.env.FILES
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const { path, query } = api(url), method = init?.method ?? 'GET'
      expect(new URL(String(url)).origin).toBe(host)
      expect(new Headers(init?.headers).get('PRIVATE-TOKEN')).toBe(token)
      calls.push(`${method} ${path}`)
      if (path === root) return Response.json({ id: 11, path_with_namespace: 'team/web/app', description: 'An app', visibility: 'private', archived: false, default_branch: 'main', runners_token: 'not-returned' })
      if (path === `${root}/repository/commits/main`) return Response.json({ id: sha })
      if (path === `${root}/repository/archive.tar.gz`) { expect(query.get('sha')).toBe(sha); return new Response('archive-bytes') }
      if (path === `${root}/repository/tree`) { expect(Object.fromEntries(query)).toMatchObject({ ref: sha, recursive: 'true' }); return Response.json([{ id: 'x', name: 'src', type: 'tree', path: 'src' }, { id: 'y', name: 'index.ts', type: 'blob', path: 'src/index.ts' }]) }
      if (path === `${root}/repository/files/src%2Findex.ts`) return Response.json({ encoding: 'base64', size: 6, content: btoa('export'), file_path: 'src/index.ts' })
      if (path === `${root}/issues/3`) return Response.json({ iid: 3, title: 'Broken', description: 'Untrusted issue', state: 'opened', user_notes_count: 1, author: { username: 'author' }, secret: 'not-returned' })
      if (path === `${root}/issues/3/notes`) return Response.json([{ id: 9, body: 'Me too', author: { username: 'reviewer' }, created_at: '2026-11-01', system: false }])
      if (path === `${root}/merge_requests/5`) return Response.json(mergeRequest({ sha: head, diff_refs: { base_sha: sha, head_sha: head } }))
      if (path === `${root}/merge_requests/5/diffs`) return Response.json([{ old_path: 'a.ts', new_path: 'b.ts', diff: '@@ -1 +1 @@', new_file: false, renamed_file: true, deleted_file: false }])
      if (path === `${root}/merge_requests/5/approvals`) return Response.json({ approved_by: [{ user: { id: 31, username: 'lead' } }] })
      if (path === `${root}/repository/commits/${head}/statuses`) return Response.json([{ id: 1, name: 'test', status: 'success', target_url: 'https://mr-5.pages.dev/' }, { id: 2, name: 'lint', status: 'failed', allow_failure: true, target_url: null }])
      if (path === `${root}/merge_requests/5/notes`) return Response.json([{ id: 12, body: 'Rename it', author: { username: 'lead' }, created_at: '2026-11-01', position: { new_path: 'b.ts', new_line: 4, head_sha: head } }])
      return new Response(`unexpected ${method} ${path}`, { status: 500 })
    }))
    runId = (await f.run(ids.owner, undefined, 'gitlab-task')).run.id
  })

  it('pins the admitted commit, and reads its tree, a file and its archive through the broker', async () => {
    expect(JSON.parse(String((f.db.prepare('SELECT environment_json AS json FROM agent_runs WHERE id=?').get(runId) as { json: string }).json))).toMatchObject({ provider: 'gitlab', baseSha: sha, baseTreeSha: sha })
    expect(await readCodeTree(f.env, runId)).toEqual({ repository: 'team/web/app', commit: sha, truncated: false, files: [{ path: 'src', type: 'tree' }, { path: 'src/index.ts', type: 'blob' }] })
    expect(await readCodeFile(f.env, runId, 'src/index.ts')).toMatchObject({ path: 'src/index.ts', content: 'export' })
    expect(await (await codeRepositoryArchive(f.env, runId)).text()).toBe('archive-bytes')
    expect([...stored.keys()]).toEqual([`agent-repositories/gitlab/${(f.db.prepare("SELECT id FROM git_connections").get() as { id: string }).id}/11/${sha}.tar.gz`])
    expect(await readGithubRepository(f.env, runId)).toMatchObject({ repository: 'team/web/app', url: `${host}/team/web/app`, private: true, defaultBranch: 'main' })
  })
  it('reads an issue and a merge request as untrusted context, at the merge request’s exact head', async () => {
    expect(await readGithubIssue(f.env, runId, { number: 3 })).toMatchObject({ kind: 'issue', url: `${host}/team/web/app/-/issues/3`, title: { text: 'Broken' }, author: 'author', commentCount: 1 })
    expect(await readGithubIssue(f.env, runId, { number: 3, section: 'comments' })).toMatchObject({ comments: [{ id: 9, author: 'reviewer', body: { text: 'Me too' } }] })
    expect(await readGithubPullRequest(f.env, runId, { number: 5 })).toMatchObject({ url: `${host}/team/web/app/-/merge_requests/5`, headSha: head, baseSha: sha, draft: true, merged: false, state: 'open' })
    expect(await readGithubPullRequest(f.env, runId, { number: 5, section: 'files' })).toMatchObject({ files: [{ path: { text: 'b.ts' }, previousPath: { text: 'a.ts' }, status: 'renamed', patchAvailable: true }] })
    expect(await readGithubPullRequest(f.env, runId, { number: 5, section: 'reviews' })).toMatchObject({ comments: [{ id: 31, author: 'lead', state: 'approved' }] })
    expect(await readGithubPullRequest(f.env, runId, { number: 5, section: 'comments' })).toMatchObject({ comments: [{ id: 12, author: 'lead', path: { text: 'b.ts' }, line: 4, commitSha: head }] })
    expect(calls.every(call => call.startsWith('GET '))).toBe(true)
  })
  it('reads a proposal’s checks at its published commit, with an allowed failure neither passing nor blocking', async () => {
    f.db.prepare("INSERT INTO agent_code_proposals(run_id,environment_id,input_hash,branch,commit_sha,published_commit_sha,pull_number,status,created_at,updated_at) VALUES(?,'gitlab-env','x','zugoid-agent/run',?,?,5,'published','2026-11-01','2026-11-01')").run(runId, head, head)
    expect(await codeProposalChecks(f.env, runId)).toEqual({ url: `${host}/team/web/app/-/merge_requests/5`, commit: head, readyForReview: true, required: [{ name: 'test', status: 'success' }], previews: ['https://mr-5.pages.dev/'], state: 'open' })
  })
})
