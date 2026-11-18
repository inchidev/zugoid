import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ids, mcpFixture } from '../helpers/outbound-mcp'
import { codeEnvironmentSchema, repositoryResourceId, type RunEnvironment } from '../../shared/code-environments'
import { giteaConnectSchema } from '../../shared/git-connections'
import { disableGitConnection, listGitConnections } from '../../server/utils/git-connections'
import { connectGitea, giteaAgentClient, giteaCredentials, giteaFlavour, giteaPush, giteaRepositories, giteaSourceFetch } from '../../server/utils/gitea'
import { giteaFactoryFeedback } from '../../server/utils/factory-gitea'
import { discoverRepositories, gitAgentConfigured, repositoryClient } from '../../server/utils/git-provider'
import { publishGiteaProposal } from '../../server/utils/gitea-proposal'
import { computeSourceCapability } from '../../server/utils/compute-nodes'
import { leaseCapability } from '../../server/utils/factory-boxes'

const host = 'https://git.example.test', token = 'a'.repeat(40)
let f: ReturnType<typeof mcpFixture>
beforeEach(() => { f = mcpFixture() })
afterEach(() => { f.db.close(); vi.unstubAllGlobals() })
const account = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
  // A Gitea has no Forgejo API.
  if (String(url) === `${host}/api/forgejo/v1/version`) return new Response('', { status: 404 })
  if (String(url) === `${host}/api/v1/version`) return Response.json({ version: '1.22.3' })
  expect(new Headers(init?.headers).get('Authorization')).toBe(`token ${token}`)
  expect(init?.redirect).toBe('manual')
  if (String(url) === `${host}/api/v1/user`) return Response.json({ id: 7, login: 'zugoid-bot' })
  if (String(url) === `${host}/api/v1/user/repos?limit=1`) return Response.json([])
  return new Response('unexpected', { status: 500 })
})
const connect = async () => connectGitea(f.env, await f.actor(), { host, token }, account)

it('accepts only an HTTPS Gitea origin and a token-shaped secret', () => {
  expect(giteaConnectSchema.parse({ host: 'https://git.example.test/', token }).host).toBe(host)
  for (const bad of ['http://git.example.test', 'https://u:p@git.example.test', 'https://git.example.test/sub', 'https://git.example.test/?x=1', 'git.example.test'])
    expect(giteaConnectSchema.safeParse({ host: bad, token }).success, bad).toBe(false)
  expect(giteaConnectSchema.safeParse({ host, token: 'short' }).success).toBe(false)
})
it('connects an Owner-provided bot token, stores it encrypted and never returns it', async () => {
  await expect(connectGitea(f.env, await f.actor(ids.member), { host, token }, account)).rejects.toMatchObject({ statusCode: 403 })
  const connection = await connect()
  expect(connection).toMatchObject({ provider: 'gitea', host, account: 'zugoid-bot', appId: '7', enabled: true, setupUrl: `${host}/zugoid-bot`, name: 'zugoid-bot on git.example.test' })
  const stored = String(f.db.prepare('SELECT credential_json AS secret FROM git_connections WHERE id=?').get(connection.id)!.secret)
  expect(stored).not.toContain(token)
  expect(JSON.stringify(await listGitConnections(f.env))).not.toContain(token)
  expect(JSON.stringify(f.db.prepare('SELECT meta_json FROM audit_log').all())).not.toContain(token)
  expect(await giteaCredentials(f.env, connection.id)).toEqual({ host, account: 'zugoid-bot', token })
  await expect(connect()).rejects.toMatchObject({ statusCode: 409 })
})
it('refuses a token Gitea rejects or one that cannot list repositories', async () => {
  await expect(connectGitea(f.env, await f.actor(), { host, token }, vi.fn(async () => new Response('', { status: 401 })))).rejects.toMatchObject({ statusCode: 400 })
  await expect(connectGitea(f.env, await f.actor(), { host, token }, vi.fn(async (url: string | URL | Request) => String(url).endsWith('/user') ? Response.json({ id: 7, login: 'zugoid-bot' }) : new Response('', { status: 403 })))).rejects.toMatchObject({ statusCode: 400 })
  await expect(connectGitea(f.env, await f.actor(), { host, token }, vi.fn(async () => new Response(null, { status: 302, headers: { Location: 'https://elsewhere.test' } })))).rejects.toMatchObject({ statusCode: 502 })
  expect(await listGitConnections(f.env)).toEqual([])
})
/** A Forgejo answering the version endpoints as `versions` says, for anonymous and token requests. */
const forgejo = (versions: { forgejo?: string | null; gitea?: string | null; signIn?: boolean }, user: () => Response = () => Response.json({ id: 7, login: 'zugoid-bot' })) => vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
  expect(init?.redirect).toBe('manual')
  const authorized = new Headers(init?.headers).get('Authorization') === `token ${token}`
  const version = (value: string | null | undefined) => versions.signIn && !authorized ? new Response('', { status: 401 }) : value ? Response.json({ version: value }) : new Response('', { status: 404 })
  if (String(url) === `${host}/api/forgejo/v1/version`) return version(versions.forgejo)
  if (String(url) === `${host}/api/v1/version`) return version(versions.gitea)
  expect(authorized).toBe(true)
  if (String(url) === `${host}/api/v1/user`) return user()
  if (String(url) === `${host}/api/v1/user/repos?limit=1`) return Response.json([])
  return new Response('unexpected', { status: 500 })
})
it('tells Forgejo from Gitea by its public version, asking without the token first', async () => {
  const credentials = { host, token }
  // Codeberg answers both: its Forgejo version, and a Gitea version that names the Gitea it follows.
  const codeberg = forgejo({ forgejo: '17.0.0-100-2254cb0+gitea-1.22.0', gitea: '17.0.0-100-2254cb0+gitea-1.22.0' })
  expect(await giteaFlavour(credentials, codeberg)).toBe('Forgejo')
  expect(codeberg).toHaveBeenCalledTimes(1)
  expect(new Headers(codeberg.mock.calls[0]![1]?.headers).get('Authorization')).toBeNull()
  expect(await giteaFlavour(credentials, forgejo({ gitea: '1.21.11-1+gitea-1.21.11' }))).toBe('Forgejo')
  expect(await giteaFlavour(credentials, forgejo({ gitea: '1.22.3' }))).toBe('Gitea')
  expect(await giteaFlavour(credentials, forgejo({ gitea: '29.0.0+dev-160-g55186ca39b' }))).toBe('Gitea')
  // A Forgejo that requires sign-in to view anything answers only with the token.
  const signedIn = forgejo({ forgejo: '11.0.1+gitea-1.22.0', signIn: true })
  expect(await giteaFlavour(credentials, signedIn)).toBe('Forgejo')
  expect(signedIn.mock.calls.map(([url, init]) => `${String(url).slice(host.length)} ${new Headers(init?.headers).has('Authorization')}`)).toEqual(['/api/forgejo/v1/version false', '/api/v1/version false', '/api/forgejo/v1/version true'])
  // Anything unclear is a Gitea, and nothing fails on it.
  expect(await giteaFlavour(credentials, forgejo({}))).toBe('Gitea')
  expect(await giteaFlavour(credentials, vi.fn(async () => { throw new TypeError('fetch failed') }))).toBe('Gitea')
  expect(await giteaFlavour(credentials, vi.fn(async () => new Response(null, { status: 302, headers: { Location: 'https://elsewhere.test' } })))).toBe('Gitea')
  expect(await giteaFlavour(credentials, vi.fn(async () => new Response('<html>', { headers: { 'content-type': 'text/html' } })))).toBe('Gitea')
})
it('connects a Forgejo, such as Codeberg, as a Gitea connection that names it', async () => {
  const connection = await connectGitea(f.env, await f.actor(), { host, token }, forgejo({ forgejo: '17.0.0-100-2254cb0+gitea-1.22.0' }))
  expect(connection).toMatchObject({ provider: 'gitea', host, account: 'zugoid-bot', appId: '7', name: 'zugoid-bot on git.example.test (Forgejo)', setupUrl: `${host}/zugoid-bot` })
  expect(f.db.prepare('SELECT provider FROM git_connections WHERE id=?').get(connection.id)).toEqual({ provider: 'gitea' })
  expect(await giteaCredentials(f.env, connection.id)).toEqual({ host, account: 'zugoid-bot', token })
  // A name the Owner gives is kept as given; the same account is still one connection.
  await expect(connectGitea(f.env, await f.actor(), { host, token, name: 'Codeberg' }, forgejo({ forgejo: '17.0.0' }))).rejects.toMatchObject({ statusCode: 409 })
  await disableGitConnection(f.env, await f.actor(), connection.id)
  expect(await connectGitea(f.env, await f.actor(), { host, token, name: 'Codeberg' }, forgejo({ forgejo: '17.0.0' }))).toMatchObject({ name: 'Codeberg' })
})
it('explains that a Forgejo token for specific repositories cannot be used', async () => {
  // Such a token holds only repository and issue scopes, so Forgejo refuses it /user.
  const refused = connectGitea(f.env, await f.actor(), { host, token }, forgejo({ forgejo: '17.0.0' }, () => new Response('', { status: 403 })))
  await expect(refused).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/^Forgejo did not accept this token\..*All \(public, private, and limited\)/u) })
  await expect(connectGitea(f.env, await f.actor(), { host, token }, forgejo({ gitea: '1.22.3' }, () => new Response('', { status: 403 })))).rejects.toMatchObject({ statusCode: 400, message: 'Gitea did not accept this token. Check that it is current and has Read access for user.' })
  expect(await listGitConnections(f.env)).toEqual([])
})
it('reads Gitea and Forgejo Actions statuses, where a skipped job neither passes nor blocks', async () => {
  const connection = await connect()
  const commit = 'c'.repeat(40)
  const item = { ...codeEnvironmentSchema.parse({ provider: 'gitea', gitConnectionId: connection.id, name: 'App', sourceRepo: 'team/app', sourceRepoId: 11, sourceInstallationId: 0, workRepo: 'team/app', workRepoId: 11, workInstallationId: 0, baseBranch: 'main', requiredChecks: ['testing / test (push)'] }),
    id: ids.server, enabled: true, version: 1, baseSha: 'b'.repeat(40), baseTreeSha: 'b'.repeat(40) } satisfies RunEnvironment
  const receipt = { number: 5, commit, branch: 'zugoid-agent/run', url: `${host}/team/app/pulls/5` }
  let statuses: Array<{ context: string; status: string; target_url: string }> = []
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
    const path = String(url).slice(`${host}/api/v1`.length)
    // Forgejo's pull request also carries `flow`, which Zugoid ignores.
    if (path === '/repos/team/app/pulls/5') return Response.json({ number: 5, state: 'open', merged: false, mergeable: true, flow: 0, title: 'WIP: Fix', head: { ref: receipt.branch, sha: commit, repo: { id: 11 } }, base: { ref: 'main', repo: { id: 11 } } })
    if (path.startsWith(`/repos/team/app/commits/${commit}/statuses?`)) return Response.json(new URL(String(url)).searchParams.get('page') === '1' ? statuses : [])
    return new Response(`unexpected ${path}`, { status: 500 })
  }))
  const feedback = () => giteaFactoryFeedback(f.env, { environment: item, receipt, ensure: async () => {} })
  // Forgejo Actions link each job by a path on the same host: not a preview, and not a safe absolute link.
  statuses = [{ context: '/ release (push)', status: 'skipped', target_url: '/team/app/actions/runs/1/jobs/2' }, { context: 'testing / test (push)', status: 'success', target_url: '/team/app/actions/runs/1/jobs/0' }]
  expect(await feedback()).toMatchObject({ state: 'success', readyForReview: true, required: [{ name: 'testing / test (push)', state: 'success' }],
    checks: [{ name: '/ release (push)', state: 'skipped', url: null }, { name: 'testing / test (push)', state: 'success', url: null }] })
  // A required check that was skipped did not pass.
  statuses = [{ context: 'testing / test (push)', status: 'skipped', target_url: '/team/app/actions/runs/1/jobs/0' }]
  expect(await feedback()).toMatchObject({ readyForReview: false, required: [{ name: 'testing / test (push)', state: 'skipped' }] })
  statuses = [{ context: '/ release (push)', status: 'skipped', target_url: '' }, { context: 'testing / test (push)', status: 'pending', target_url: '' }]
  expect(await feedback()).toMatchObject({ state: 'running', readyForReview: false })
})
it('discovers only pushable, active repositories with Gitea-scoped resource IDs', async () => {
  const connection = await connect()
  const remote = vi.fn(async (url: string | URL | Request) => {
    expect(String(url)).toBe(`${host}/api/v1/user/repos?limit=50&page=1`)
    return Response.json([
      { id: 11, full_name: 'team/app', fork: false, archived: false, default_branch: 'main', permissions: { push: true } },
      { id: 12, full_name: 'team/old', fork: false, archived: true, default_branch: 'main', permissions: { push: true } },
      { id: 13, full_name: 'team/read', fork: false, archived: false, default_branch: 'main', permissions: { push: false } },
    ])
  })
  expect(await giteaRepositories(f.env, connection.id, remote)).toEqual([{ id: 11, name: 'team/app', installationId: 0, fork: false, defaultBranch: 'main', resourceId: `gitea:${connection.id}:11` }])
  expect(await discoverRepositories(f.env, connection.id, remote)).toHaveLength(1)
  expect(await gitAgentConfigured(f.env, connection.id)).toBe(true)
  await disableGitConnection(f.env, await f.actor(), connection.id)
  expect(await gitAgentConfigured(f.env, connection.id)).toBe(false)
  await expect(giteaCredentials(f.env, connection.id)).rejects.toMatchObject({ statusCode: 403 })
})
it('keeps Gitea repository scopes apart from GitHub repository IDs', () => {
  const base = { name: 'App', sourceRepo: 'team/app', sourceRepoId: 11, workRepo: 'team/app', workRepoId: 11, baseBranch: 'main', requiredChecks: ['ci'] }
  const gitea = codeEnvironmentSchema.parse({ ...base, provider: 'gitea', gitConnectionId: ids.server, sourceInstallationId: 0, workInstallationId: 0 })
  expect(repositoryResourceId(gitea)).toBe(`gitea:${ids.server}:11`)
  expect(repositoryResourceId(codeEnvironmentSchema.parse({ ...base, sourceInstallationId: 5, workInstallationId: 5 }))).toBe('11')
  expect(codeEnvironmentSchema.safeParse({ ...base, provider: 'gitea', gitConnectionId: null, sourceInstallationId: 0, workInstallationId: 0 }).success).toBe(false)
  expect(codeEnvironmentSchema.safeParse({ ...base, sourceInstallationId: 0, workInstallationId: 0 }).success).toBe(false)
})
it('confines the broker to one repository and its operation class', async () => {
  const connection = await connect()
  const remote = vi.fn(async () => Response.json({}))
  const reader = await giteaAgentClient(f.env, { connectionId: connection.id, repository: 'team/app', access: 'read' }, undefined, remote)
  await reader.json('/repos/team/app/contents/README.md?ref=main')
  await expect(reader.raw('/repos/team/other')).rejects.toThrow('Invalid broker path')
  await expect(reader.raw('/repos/team/app-evil')).rejects.toThrow('Invalid broker path')
  await expect(reader.raw('/repos/team/app/../other')).rejects.toThrow('Invalid broker path')
  await expect(reader.raw('/repos/team/app/contents', 'POST', {})).rejects.toThrow('outside this repository capability')
  const writer = await giteaAgentClient(f.env, { connectionId: connection.id, repository: 'team/app', access: 'work' }, undefined, remote)
  await writer.json('/repos/team/app/contents', 'POST', {})
  await expect(writer.raw('/repos/team/app/pulls', 'POST', {})).rejects.toThrow('outside this repository capability')
  await expect(writer.raw('/repos/team/app', 'DELETE')).rejects.toThrow('outside this repository capability')
  expect(remote).toHaveBeenCalledTimes(2)
})
it('serves Git source read-only and never follows a redirect', async () => {
  const connection = await connect()
  const upstream = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    expect(new Headers(init?.headers).get('Authorization')).toBe('Basic ' + btoa(`zugoid-bot:${token}`))
    return String(url).includes('redirect') ? new Response(null, { status: 302, headers: { Location: 'https://elsewhere.test' } }) : new Response('refs', { headers: { 'content-type': 'application/x-git-upload-pack-advertisement' } })
  })
  vi.stubGlobal('fetch', upstream)
  const refs = await giteaSourceFetch(f.env, connection.id, 'team/app', '/info/refs', new Request('https://server.test/x/info/refs?service=git-upload-pack'))
  expect(await refs.text()).toBe('refs')
  expect(String(upstream.mock.calls[0]![0])).toBe(`${host}/team/app.git/info/refs?service=git-upload-pack`)
  expect((await giteaSourceFetch(f.env, connection.id, 'team/app', '/info/refs', new Request('https://server.test/x/info/refs?service=git-receive-pack'))).status).toBe(403)
  expect((await giteaSourceFetch(f.env, connection.id, 'team/app', '/git-receive-pack', new Request('https://server.test/x/git-receive-pack', { method: 'POST', body: 'x' }))).status).toBe(403)
  expect((await giteaSourceFetch(f.env, connection.id, 'team/redirect', '/info/refs', new Request('https://server.test/x/info/refs?service=git-upload-pack'))).status).toBe(502)
  expect(upstream).toHaveBeenCalledTimes(2)
})
it('forwards a push to Gitea only for the one approved update, adding the Gitea token itself', async () => {
  const connection = await connect()
  const ref = 'refs/heads/zugoid-agent/00000000-0000-4000-8000-0000000000c1', sha = 'c'.repeat(40), zero = '0'.repeat(40)
  const pkt = (line: string) => (line.length + 4).toString(16).padStart(4, '0') + line
  const body = (command: string) => pkt(command + '\0report-status side-band-64k\n') + '0000PACK'
  const forwarded: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    expect(new Headers(init?.headers).get('Authorization')).toBe('Basic ' + btoa(`zugoid-bot:${token}`))
    forwarded.push(String(url) + ' ' + (init?.body ? await new Response(init.body as BodyInit).text() : ''))
    return new Response('ok', { headers: { 'content-type': 'application/x-git-receive-pack-result' } })
  }))
  const post = (text: string) => new Request('https://server.test/x/git-receive-pack', { method: 'POST', body: text, duplex: 'half' } as RequestInit)
  expect((await giteaPush(f.env, connection.id, 'team/app', '/info/refs', new Request('https://server.test/x/info/refs?service=git-receive-pack'), { ref, sha })).status).toBe(200)
  expect((await giteaPush(f.env, connection.id, 'team/app', '/git-receive-pack', post(body(`${zero} ${sha} ${ref}`)), { ref, sha })).status).toBe(200)
  expect(forwarded).toEqual([`${host}/team/app.git/info/refs?service=git-receive-pack `, `${host}/team/app.git/git-receive-pack ${body(`${zero} ${sha} ${ref}`)}`])
  for (const command of [`${zero} ${sha} refs/heads/main`, `${zero} ${'d'.repeat(40)} ${ref}`, `${sha} ${zero} ${ref}`])
    expect((await giteaPush(f.env, connection.id, 'team/app', '/git-receive-pack', post(body(command)), { ref, sha })).status, command).toBe(403)
  expect((await giteaPush(f.env, connection.id, 'team/app', '/info/refs', new Request('https://server.test/x/info/refs?service=git-upload-pack'), { ref, sha })).status).toBe(403)
  expect(forwarded).toHaveLength(2)
})
it('binds a Node’s publish capability to one approval and the box’s lease, apart from its source capability', async () => {
  const approval = '00000000-0000-4000-8000-0000000000f1'
  const publish = await leaseCapability(f.env, 'compute-publish', approval, 'lease-a')
  expect(publish).not.toBe(await leaseCapability(f.env, 'compute-source', approval, 'lease-a'))
  expect(publish).not.toBe(await leaseCapability(f.env, 'compute-publish', approval, 'lease-b'))
})
it('binds the Node source capability to one action and lease', async () => {
  const first = await computeSourceCapability(f.env, ids.owner, 'lease-a')
  expect(first).toMatch(/^[a-f0-9]{64}$/u)
  expect(await computeSourceCapability(f.env, ids.owner, 'lease-a')).toBe(first)
  expect(await computeSourceCapability(f.env, ids.owner, 'lease-b')).not.toBe(first)
  expect(await computeSourceCapability(f.env, ids.member, 'lease-a')).not.toBe(first)
})
it('publishes a proposal on a Run branch started at the admitted base and opens a WIP pull request', async () => {
  const connection = await connect()
  const base = 'b'.repeat(40), commit = 'c'.repeat(40)
  const item = { ...codeEnvironmentSchema.parse({ provider: 'gitea', gitConnectionId: connection.id, name: 'App', sourceRepo: 'team/app', sourceRepoId: 11, sourceInstallationId: 0, workRepo: 'team/app', workRepoId: 11, workInstallationId: 0, baseBranch: 'main', requiredChecks: ['ci'] }),
    id: ids.server, enabled: true, version: 1, baseSha: base, baseTreeSha: 'd'.repeat(40) } satisfies RunEnvironment
  let branch: string | null = null
  const calls: string[] = []
  const pull = { number: 5, state: 'open', merged: false, title: 'WIP: Fix', body: 'Body', head: { ref: 'zugoid-agent/run', sha: commit, repo: { id: 11 } }, base: { ref: 'main', repo: { id: 11 } } }
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url).slice(`${host}/api/v1`.length), method = init?.method ?? 'GET'
    calls.push(`${method} ${path}`)
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    if (path === '/repos/team/app/git/refs/heads/zugoid-agent/run') return branch ? Response.json([{ ref: 'refs/heads/zugoid-agent/run-old', object: { sha: 'e'.repeat(40) } }, { ref: 'refs/heads/zugoid-agent/run', object: { sha: branch } }]) : new Response('', { status: 404 })
    if (path === '/repos/team/app/branches' && method === 'POST') { expect(body).toEqual({ new_branch_name: 'zugoid-agent/run', old_ref_name: base }); branch = base; return Response.json({}) }
    if (path.startsWith('/repos/team/app/contents/README.md')) return Response.json({ type: 'file', sha: 'f'.repeat(40) })
    if (path.startsWith('/repos/team/app/contents/new.txt')) return new Response('', { status: 404 })
    if (path === '/repos/team/app/contents' && method === 'POST') {
      expect(body.branch).toBe('zugoid-agent/run')
      expect(body.files).toEqual([{ operation: 'update', path: 'README.md', content: Buffer.from('Привет').toString('base64'), sha: 'f'.repeat(40) }, { operation: 'create', path: 'new.txt', content: btoa('new') }])
      branch = commit
      return Response.json({ commit: { sha: commit, parents: [{ sha: base }] } })
    }
    if (path.startsWith('/repos/team/app/pulls?state=all')) return Response.json([])
    if (path === '/repos/team/app/pulls' && method === 'POST') { expect(body).toMatchObject({ title: 'WIP: Fix', head: 'zugoid-agent/run', base: 'main' }); return Response.json(pull) }
    return new Response(`unexpected ${method} ${path}`, { status: 500 })
  }))
  const recorded: string[] = []
  const result = await publishGiteaProposal(f.env, { runId: 'run', environment: item, input: { title: 'Fix', body: '', files: [{ path: 'README.md', content: 'Привет', executable: false }, { path: 'new.txt', content: 'new', executable: false }] },
    description: 'Body', branch: 'zugoid-agent/run', proposal: { commitSha: null, publishedCommitSha: null, pullNumber: null }, ensure: async () => {}, recordCommit: async sha => { recorded.push(sha) } })
  expect(result).toEqual({ number: 5, url: `${host}/team/app/pulls/5`, commit })
  expect(recorded).toEqual([commit])
  expect(calls).not.toContain('PATCH /repos/team/app/pulls/5')
  await expect(publishGiteaProposal(f.env, { runId: 'run', environment: item, input: { title: 'Fix', body: '', files: [{ path: 'run.sh', content: 'echo', executable: true }] },
    description: 'Body', branch: 'zugoid-agent/run', proposal: { commitSha: null, publishedCommitSha: commit, pullNumber: null }, ensure: async () => {}, recordCommit: async () => {} })).rejects.toMatchObject({ statusCode: 400 })
  // A branch moved outside the Run is never written over.
  branch = 'e'.repeat(40)
  await expect(publishGiteaProposal(f.env, { runId: 'run', environment: item, input: { title: 'Fix', body: '', files: [{ path: 'new.txt', content: 'again', executable: false }] },
    description: 'Body', branch: 'zugoid-agent/run', proposal: { commitSha: null, publishedCommitSha: commit, pullNumber: null }, ensure: async () => {}, recordCommit: async () => {} })).rejects.toMatchObject({ statusCode: 409 })
  const client = await repositoryClient(f.env, item, 'source', 'read')
  expect(client.web('/pulls/5')).toBe(`${host}/team/app/pulls/5`)
})
