import { DatabaseSync } from 'node:sqlite'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { d1 } from '../helpers/sqlite-d1'
import { INIT_SQL } from '../../server/utils/db'
import { loadAuthorizationContext } from '../../server/utils/authorization'
import { createAgentRun, findAgentRun, runAuthorization, runCapability, verifyRunCapability } from '../../server/utils/agent-run-service'
import { agentGateway } from '../../server/utils/agent-gateway'
import { agentTools, executeRunTool } from '../../server/utils/agent-tools'
import { saveAgentProvider } from '../../server/utils/agent-providers'
import { updateIntegrations } from '../../server/utils/integrations'
import { beginThreadsConnection, completeThreadsConnection, disconnectThreads } from '../../server/utils/threads-connection'
import { writeServerSetting } from '../../shared/server-settings'
import { ALL_PERMISSIONS, Permission } from '../../shared/permissions'
import type { ZugoidEnv } from '../../workers/env'
import { requestTiming } from '../../server/utils/request-timing'

const serverId = '00000000-0000-4000-8000-000000000001'
const agentId = '00000000-0000-4000-8000-000000000002'
let db: DatabaseSync
let env: ZugoidEnv
const wake = vi.fn()
const start = () => loadAuthorizationContext(env, { principalId: 'owner-user', credential: { kind: 'session' } })
const input = () => ({ agentId, channelId: 'public-chat', prompt: 'Research the market', idempotencyKey: 'request-0001' })

beforeEach(() => {
  wake.mockReset()
  db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys=ON')
  db.exec(INIT_SQL)
  db.prepare('INSERT INTO server_settings(key,value,updated_at) VALUES(?,?,?)').run('agents.executionPolicy', JSON.stringify({ mode: 'review', maxSteps: 20, maxModelCalls: 20, maxToolCalls: 100, maxTokens: 64000 }), new Date().toISOString())
  db.exec(`INSERT INTO server_identity(singleton,id) VALUES(1,'${serverId}');
    INSERT INTO roles(id,key,name,permissions_bitmask,resource_access_json) VALUES
      ('owner-role','owner','Owner',0,'{}'),
      ('agent-role','custom:agent','Researcher',${Permission.sendMessages | Permission.readTasks},'{"boards":["board-allowed"]}');
    INSERT INTO users(id,kind,display_name,status,role_id,joined_at) VALUES
      ('owner-user','human','Owner','active','owner-role','2026-10-21'),
      ('${agentId}','agent','Researcher','active','agent-role','2026-10-21');
    INSERT INTO server(id,name,owner_id) VALUES('${serverId}','Zugoid','owner-user');
    INSERT INTO agents(user_id,created_by,harness,model) VALUES('${agentId}','owner-user','pi','');
    INSERT INTO channels(id,name,type,visibility) VALUES('public-chat','Research','text','server');
    INSERT INTO task_boards(id,name,created_by) VALUES('board-allowed','Allowed','owner-user'),('board-private','Private','owner-user');`)
  env = { DB: d1(db), AUTH_SECRET: 'test-server-secret-with-32-characters', FILES: {},
    AI: {}, AGENT_MODEL: '@cf/test', AGENT_RUN_DO: { getByName: () => ({ wake }) }, AGENT_RUNNER_URL: 'http://runner', AGENT_RUNNER_TOKEN: 'runner-secret' } as unknown as ZugoidEnv
})
afterEach(() => db.close())

describe('Pi run authorization', () => {
  it('recovers a persisted admission when the first wake fails, without creating another attempt', async () => {
    wake.mockRejectedValueOnce(new Error('Coordinator unavailable'))
    await expect(createAgentRun(env, (await start())!, input())).rejects.toThrow('Coordinator unavailable')
    const retry = await createAgentRun(env, (await start())!, input())
    expect(retry.status).toBe('queued')
    expect(db.prepare('SELECT count(*) as count FROM agent_runs').get()).toMatchObject({ count: 1 })
    expect(wake).toHaveBeenCalledTimes(2)
  })
  it('rejects concurrent reuse of a request identity for different work', async () => {
    const actor = (await start())!
    const results = await Promise.allSettled([createAgentRun(env, actor, input()), createAgentRun(env, actor, { ...input(), prompt: 'Different work' })])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find(result => result.status === 'rejected')
    expect(rejected).toMatchObject({ status: 'rejected', reason: { statusCode: 409 } })
    expect(db.prepare('SELECT count(*) as count FROM agent_runs').get()).toMatchObject({ count: 1 })
  })
  it('creates one durable attempt for duplicate admission and retains role ceilings under owner invocation', async () => {
    const first = await createAgentRun(env, (await start())!, input())
    const second = await createAgentRun(env, (await start())!, input())
    expect(second.id).toBe(first.id)
    expect(wake).toHaveBeenCalledTimes(2)
    const authorization = await runAuthorization(env, first)
    expect(authorization.principal.permissions & Permission.writeTasks).toBe(0)
    expect(authorization.principal.resourceAccess?.boards).toEqual(['board-allowed'])
  })

  it('admits no new Run in an archived channel and fences one already admitted', async () => {
    const admitted = await createAgentRun(env, (await start())!, input())
    db.exec("UPDATE channels SET archived_at='2026-10-24T00:00:00Z' WHERE id='public-chat'")
    const archived = { statusCode: 409, data: { error: { code: 'channel_archived' } } }
    await expect(createAgentRun(env, (await start())!, { ...input(), idempotencyKey: 'request-0002' })).rejects.toMatchObject(archived)
    await expect(runAuthorization(env, admitted)).rejects.toMatchObject(archived)
    expect(db.prepare('SELECT count(*) as count FROM agent_runs').get()).toMatchObject({ count: 1 })
  })

  it('rejects capability replay against another run and rejects tools before execution starts', async () => {
    const run = await createAgentRun(env, (await start())!, input())
    const token = await runCapability(env, run.id)
    expect(await verifyRunCapability(env, run.id, token)).toBe(true)
    expect(await verifyRunCapability(env, 'another-run', token)).toBe(false)
    const response = await agentGateway(new Request('http://server/tools', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: '{}' }), env, run.id, 'tools', () => {})
    expect(response.status).toBe(403)
  })

  it('filters tools through current role and resources, including after role revocation', async () => {
    const run = await createAgentRun(env, (await start())!, input())
    db.prepare("UPDATE agent_runs SET status='running' WHERE id=?").run(run.id)
    const token = await runCapability(env, run.id)
    const call = (callId: string, name: string, args: unknown = {}) => agentGateway(new Request('http://server/tools', {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ callId, name, arguments: args }),
    }), env, run.id, 'tools', () => {})
    const first = await call('call-1', 'list_tasks')
    expect(first.status).toBe(200)
    expect(await first.json()).toMatchObject({ boards: [{ id: 'board-allowed' }] })
    const denied = await call('call-2', 'create_task', { boardId: 'board-allowed', title: 'Unauthorized write' })
    expect(denied.status).toBe(403)
    db.exec(`UPDATE roles SET permissions_bitmask=${Permission.sendMessages} WHERE id='agent-role'`)
    expect((await call('call-3', 'list_tasks')).status).toBe(403)
    expect((await call('call-1', 'list_tasks')).status).toBe(403)
    expect((await findAgentRun(env, run.id))?.status).toBe('running')
  })

  it('discovers bounded permitted metadata, loads one schema and observes revocation on the next call', async () => {
    const run = await createAgentRun(env, (await start())!, input())
    db.prepare("UPDATE agent_runs SET status='running' WHERE id=?").run(run.id)
    const token = await runCapability(env, run.id)
    const call = (callId: string, name: string, args: unknown) => agentGateway(new Request('http://server/tools', {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ callId, name, arguments: args }),
    }), env, run.id, 'tools', () => {})
    const search = await call('search-1', 'search_tools', { query: 'tasks' })
    expect(search.status).toBe(200)
    const found = await search.json() as { tools: Array<{ name: string }> }
    expect(found.tools.map(tool => tool.name)).toContain('list_tasks')
    expect(JSON.stringify(found)).not.toMatch(/board-private|parameters|create_task/)
    const details = await call('details-1', 'get_tool_details', { name: 'list_tasks', purpose: 'Find accessible work' })
    expect(details.status).toBe(200)
    expect(await details.json()).toMatchObject({ tool: { name: 'list_tasks', parameters: { type: 'object' }, guidance: { effect: 'read' } }, purpose: 'Find accessible work' })
    expect((await call('details-forged', 'get_tool_details', { name: 'create_task', purpose: 'Try a write' })).status).toBe(403)
    db.exec(`UPDATE roles SET permissions_bitmask=${Permission.sendMessages} WHERE id='agent-role'`)
    const revoked = await call('search-2', 'search_tools', { query: 'tasks' })
    // Reducing a Role revokes the entire admitted Run, including discovery.
    expect(revoked.status).toBe(403)
    expect(await revoked.json()).toMatchObject({ error: { message: 'Current permissions do not allow this operation' } })
    expect((await call('details-2', 'get_tool_details', { name: 'list_tasks', purpose: 'Retry' })).status).toBe(403)
    expect((await call('forged-direct', 'list_tasks', {})).status).toBe(403)
  })

  it('searches X from a Run on another model using the stored xAI key', async () => {
    db.exec(`UPDATE roles SET permissions_bitmask=permissions_bitmask|${Permission.browseWeb} WHERE id='agent-role'`)
    await writeServerSetting(env.DB, 'agents.executionPolicy', '{"mode":"role","maxTokens":64000}')
    const run = await createAgentRun(env, (await start())!, input())
    expect(run.model).toBe('@cf/test')
    db.prepare("UPDATE agent_runs SET status='running' WHERE id=?").run(run.id)
    const token = await runCapability(env, run.id)
    const call = (callId: string, name: string, args: unknown) => agentGateway(new Request('http://server/tools', {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ callId, name, arguments: args }),
    }), env, run.id, 'tools', () => {})
    const search = (id: string) => call(id, 'search_tools', { query: 'search_x' })
    const xTool = expect.objectContaining({ name: 'search_x', cost: 'inference' })
    expect((await (await search('x-disabled')).json()).tools).not.toEqual(expect.arrayContaining([xTool]))
    await updateIntegrations(env, { values: { XAI_API_KEY: 'synthetic-xai-key' } })
    expect(await (await search('x-enabled')).json()).toMatchObject({
      tools: expect.arrayContaining([xTool]),
    })

    const transport = vi.spyOn(globalThis, 'fetch').mockImplementation(async (request, init) => {
      expect(String(request)).toBe('https://api.x.ai/v1/responses')
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer synthetic-xai-key')
      expect(init?.redirect).toBe('manual')
      const body = JSON.parse(String(init?.body))
      expect(body).toMatchObject({ store: false, max_turns: 3, parallel_tool_calls: false,
        tools: [{ type: 'x_search', allowed_x_handles: ['zugoid'], from_date: '2026-11-25', to_date: '2026-11-27' }],
      })
      expect(body.input[1]).toEqual({ role: 'user', content: 'What shipped recently?' })
      expect(String(init?.body)).not.toContain(run.prompt)
      return Response.json({ status: 'completed', output: [
        { type: 'custom_tool_call', name: 'x_keyword_search' },
        { type: 'message', role: 'assistant', content: [
          { type: 'output_text', text: 'The release is public.', annotations: [
            { type: 'url_citation', url: 'https://twitter.com/zugoid/status/123?s=20' },
            { type: 'url_citation', url: 'https://x.com/zugoid/status/123/photo/1' },
            { type: 'url_citation', url: 'https://x.com/zugoid/status/456' },
            { type: 'url_citation', url: 'https://x.com.example.org/zugoid/status/789' },
            { type: 'url_citation', url: 'https://x.com/zugoid' },
          ] },
        ] },
      ], usage: { total_tokens: 1700 } })
    })
    try {
      const args = { query: 'What shipped recently?', handles: ['@Zugoid', 'zugoid'], fromDate: '2026-11-25', toDate: '2026-11-27' }
      const response = await call('x-watch', 'search_x', args)
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({
        summary: 'The release is public.',
        sources: [{ url: 'https://x.com/zugoid/status/123' }, { url: 'https://x.com/zugoid/status/456' }],
      })
      expect(await findAgentRun(env, run.id)).toMatchObject({ totalTokens: 1700, modelCalls: 1 })
      expect((await call('x-watch', 'search_x', args)).ok).toBe(true)
      expect((await call('x-invalid-range', 'search_x', { ...args, toDate: '2026-11-24' })).ok).toBe(false)
      db.prepare('UPDATE agent_runs SET private_at=? WHERE id=?').run(new Date().toISOString(), run.id)
      expect((await call('x-after-private', 'search_x', args)).status).toBe(403)
      expect(transport).toHaveBeenCalledTimes(1)

      await updateIntegrations(env, { values: { XAI_API_KEY: null } })
      expect((await (await search('x-disconnected')).json()).tools).not.toEqual(expect.arrayContaining([xTool]))
    } finally { transport.mockRestore() }
  })

  it('discovers and calls Threads Search on any model with Research the web', async () => {
    db.exec(`UPDATE roles SET permissions_bitmask=permissions_bitmask|${Permission.browseWeb} WHERE id='agent-role'`)
    await writeServerSetting(env.DB, 'agents.executionPolicy', '{"mode":"role","maxTokens":64000}')
    const run = await createAgentRun(env, (await start())!, input())
    expect(run.model).toBe('@cf/test')
    db.prepare("UPDATE agent_runs SET status='running' WHERE id=?").run(run.id)
    const token = await runCapability(env, run.id)
    const call = (callId: string, name: string, args: unknown) => agentGateway(new Request('http://server/tools', {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ callId, name, arguments: args }),
    }), env, run.id, 'tools', () => {})
    const search = (id: string) => call(id, 'search_tools', { query: 'search_threads' })
    const threadsTool = expect.objectContaining({ name: 'search_threads', cost: 'network' })
    expect((await (await search('threads-disabled')).json()).tools).not.toEqual(expect.arrayContaining([threadsTool]))

    const transport = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ access_token: 'synthetic-short-token' }))
      .mockResolvedValueOnce(Response.json({ access_token: 'synthetic-long-token', expires_in: 5184000 }))
    try {
      const owner = { serverId, userId: 'owner-user' }
      const authorization = new URL(await beginThreadsConnection(env, owner, 'https://zugoid.example', { appId: '1234', appSecret: 'synthetic-app-secret' }))
      const callback = new URL(authorization.searchParams.get('redirect_uri')!)
      callback.searchParams.set('state', authorization.searchParams.get('state')!)
      callback.searchParams.set('code', 'synthetic-code')
      expect(await completeThreadsConnection(env, owner, callback)).toBe('connected')
      expect(await (await search('threads-enabled')).json()).toMatchObject({ tools: expect.arrayContaining([threadsTool]) })
      transport.mockClear()
      transport.mockImplementationOnce(async (request, init) => {
        const url = new URL(String(request))
        expect(url.origin + url.pathname).toBe('https://graph.threads.com/v1.0/keyword_search')
        expect(Object.fromEntries(url.searchParams)).toEqual({
          q: 'Game dev', search_mode: 'TAG', search_type: 'RECENT', author_username: 'zugoid',
          since: '2026-01-01', until: '2026-01-02', fields: 'text,username,permalink,timestamp', limit: '12',
        })
        expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer synthetic-long-token')
        expect(init?.redirect).toBe('manual')
        return Response.json({
          data: [
            { permalink: 'https://www.threads.net/@zugoid/post/ABC?tracking=123', username: 'zugoid', text: 'A public post.', timestamp: '2026-01-01T15:00:00+0000' },
            { permalink: 'https://www.threads.com/@zugoid/post/ABC', text: 'Duplicate' },
            { permalink: 'https://www.threads.com.example.net/@zugoid/post/DEF', text: 'Foreign link' },
          ],
          paging: { next: 'https://graph.threads.com/keyword_search?access_token=synthetic-long-token' },
        })
      })
      const args = { query: 'Game dev', mode: 'tag', sort: 'recent', author: '@zugoid', since: '2026-01-01', until: '2026-01-02' }
      const result = await call('threads-search', 'search_threads', args)
      expect(result.status).toBe(200)
      const body = await result.json()
      expect(body.posts).toEqual([{ url: 'https://www.threads.com/@zugoid/post/ABC', author: 'zugoid', text: 'A public post.', timestamp: '2026-01-01T15:00:00+0000' }])
      expect(JSON.stringify(body)).not.toContain('synthetic-long-token')
      expect((await findAgentRun(env, run.id))?.modelCalls).toBe(0)
      expect((await call('threads-invalid', 'search_threads', { ...args, until: args.since })).ok).toBe(false)

      transport.mockResolvedValueOnce(Response.json({ error: { code: 190, message: 'upstream diagnostics with secret' } }, { status: 400 }))
      const invalidToken = await call('threads-expired', 'search_threads', args)
      expect(invalidToken.status).toBe(409)
      expect(JSON.stringify(await invalidToken.json())).not.toContain('upstream diagnostics')

      db.prepare('UPDATE agent_runs SET private_at=? WHERE id=?').run(new Date().toISOString(), run.id)
      expect((await call('threads-after-private', 'search_threads', args)).status).toBe(403)
      expect(transport).toHaveBeenCalledTimes(2)
      await disconnectThreads(env)
      expect((await (await search('threads-disconnected')).json()).tools).not.toEqual(expect.arrayContaining([threadsTool]))
    } finally { transport.mockRestore() }
  })

  it('watches a bounded YouTube clip through Gemini from a Run using another model', async () => {
    db.exec(`UPDATE roles SET permissions_bitmask=permissions_bitmask|${Permission.browseWeb} WHERE id='agent-role'`)
    await writeServerSetting(env.DB, 'agents.executionPolicy', '{"mode":"role","maxTokens":64000}')
    await saveAgentProvider(env, 'video', { kind: 'google', enabled: true, webSearch: false, apiKey: 'synthetic-gemini-key',
      models: [{ id: 'gemini-3.8-flash', api: 'google', inputs: ['text', 'video'] }] })
    await writeServerSetting(env.DB, 'ai.function.video.youtube', '{"model":"zugoid:video:gemini-3.8-flash"}')
    const run = await createAgentRun(env, (await start())!, input())
    expect(run.model).toBe('@cf/test')
    db.prepare("UPDATE agent_runs SET status='running' WHERE id=?").run(run.id)
    const token = await runCapability(env, run.id)
    const call = (callId: string, name: string, args: unknown) => agentGateway(new Request('http://server/tools', {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ callId, name, arguments: args }),
    }), env, run.id, 'tools', () => {})
    const transport = vi.spyOn(globalThis, 'fetch').mockImplementation(async (request, init) => {
      expect(String(request)).toBe('https://generativelanguage.googleapis.com/v1/interactions')
      expect(new Headers(init?.headers).get('x-goog-api-key')).toBe('synthetic-gemini-key')
      expect(init?.redirect).toBe('manual')
      expect(JSON.parse(String(init?.body))).toMatchObject({
        model: 'gemini-3.8-flash', store: false, input: [
          { type: 'video', uri: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', processing: { type: 'static', start_offset: '60s', end_offset: '90s' } },
          { type: 'text', text: 'What happens in this clip?' },
        ],
      })
      return Response.json({ steps: [{ type: 'model_output', content: [{ type: 'text', text: 'At 01:06 the example begins.' }] }], usage: { total_tokens: 4200 } })
    })
    try {
      expect(await (await call('youtube-discover', 'search_tools', { query: 'watch youtube' })).json()).toMatchObject({
        tools: expect.arrayContaining([expect.objectContaining({ name: 'watch_youtube' })]),
      })
      const response = await call('youtube-watch', 'watch_youtube', {
        url: 'https://youtu.be/dQw4w9WgXcQ?si=tracking', question: 'What happens in this clip?', startSeconds: 60, durationSeconds: 30,
      })
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', analysis: 'At 01:06 the example begins.' })
      expect(await findAgentRun(env, run.id)).toMatchObject({ totalTokens: 4200, modelCalls: 1 })
      expect((await call('youtube-invalid', 'watch_youtube', { url: 'https://youtube.com.example.org/watch?v=dQw4w9WgXcQ', question: 'Read it' })).ok).toBe(false)
      expect(transport).toHaveBeenCalledTimes(1)
    } finally { transport.mockRestore() }
  })

  it('keeps outbound discovery blocked across connection changes without exposing credentials', async () => {
    db.exec(`UPDATE roles SET permissions_bitmask=permissions_bitmask|${Permission.browseWeb} WHERE id='agent-role'`)
    const run = await createAgentRun(env, (await start())!, input())
    const discover = async () => agentTools(env, await runAuthorization(env, run), () => {}, run).call('search_tools', { query: 'research' })
    // Local Data/Task search may match 'research'; external web search must stay absent.
    const noWebSearch = { tools: expect.not.arrayContaining([expect.objectContaining({ name: 'search_web' })]) }
    expect(await discover()).toMatchObject(noWebSearch)
    const connection = { kind: 'openrouter' as const, enabled: true, webSearch: true, apiKey: 'synthetic-provider-secret', models: [{ id: 'model', api: 'chat' as const }] }
    await saveAgentProvider(env, 'research', connection)
    await writeServerSetting(env.DB, 'ai.function.web.search', '{"model":"zugoid:research:model"}')
    db.prepare("UPDATE agent_runs SET status='running' WHERE id=?").run(run.id)
    await runAuthorization(env, run)
    const replayCall = { callId: 'discovery-replay', name: 'search_tools', arguments: { query: 'research' } }
    await executeRunTool(env, run.id, replayCall, () => {})
    const available = await discover()
    expect(available).toMatchObject(noWebSearch)
    expect(JSON.stringify(available)).not.toContain(connection.apiKey)
    await saveAgentProvider(env, 'research', { ...connection, enabled: false })
    await expect(executeRunTool(env, run.id, replayCall, () => {})).resolves.toMatchObject(noWebSearch)
    expect(await discover()).toMatchObject(noWebSearch)
    const tools = agentTools(env, await runAuthorization(env, run), () => {}, run)
    await expect(tools.call('get_tool_details', { name: 'search_web', purpose: 'Research' })).rejects.toMatchObject({ statusCode: 403 })
    await expect(tools.call('search_web', { query: 'Research' })).rejects.toMatchObject({ statusCode: 403 })
  })

  it('bounds cumulative selected schemas through the existing Run ledger', async () => {
    const run = await createAgentRun(env, (await start())!, input())
    const insert = db.prepare("INSERT INTO agent_run_tools(run_id,call_id,name,arguments_json,policy_json,status,result_json,created_at) VALUES(?,?,'get_tool_details','{}','{}','completed',?,'2026-10-21')")
    for (let i = 0; i < 24; i++) insert.run(run.id, `loaded-${i}`, JSON.stringify({ tool: { name: `prior_${i}`, parameters: {} } }))
    const tools = agentTools(env, await runAuthorization(env, run), () => {}, run)
    await expect(tools.call('get_tool_details', { name: 'list_tasks', purpose: 'One more tool' })).rejects.toMatchObject({ statusCode: 413 })
    // A prior large schema also prevents unbounded description/context growth.
    db.prepare("DELETE FROM agent_run_tools WHERE run_id=?").run(run.id)
    insert.run(run.id, 'large', JSON.stringify({ tool: { name: 'prior_large', description: 'x'.repeat(128000), parameters: {} } }))
    await expect(tools.call('get_tool_details', { name: 'list_tasks', purpose: 'One more tool' })).rejects.toMatchObject({ statusCode: 413 })
  })

  it('does not discover or call resource tools when Agent and delegator scopes have no intersection', async () => {
    db.exec(`UPDATE roles SET permissions_bitmask=permissions_bitmask|${Permission.readData | Permission.writeData} WHERE id='agent-role'`)
    const run = await createAgentRun(env, (await start())!, input())
    const authorization = await runAuthorization(env, run)
    authorization.principal.resourceAccess = { boards: ['agent-board'], databases: [], documents: [], canvases: [] }
    authorization.delegation!.resourceAccess = { boards: ['other-board'], databases: [], documents: [], canvases: [] }
    const tools = agentTools(env, authorization, () => {}, run)
    expect(await tools.call('search_tools', { query: 'tasks records data documents' })).toMatchObject({ tools: [] })
    for (const name of ['list_tasks', 'list_tables', 'list_data', 'get_item', 'create_item']) {
      await expect(tools.call('get_tool_details', { name, purpose: 'Read resources' })).rejects.toMatchObject({ statusCode: 403 })
      await expect(tools.call(name, {})).rejects.toMatchObject({ statusCode: 403 })
    }
  })

  it('offers Data tools to a permitted Agent and hides paused App draft tools', async () => {
    db.exec(`UPDATE roles SET permissions_bitmask=${ALL_PERMISSIONS} WHERE id='agent-role'`)
    const run = await createAgentRun(env, (await start())!, input())
    const tools = agentTools(env, await runAuthorization(env, run), () => {}, run)
    const names = (await tools.catalog()).map(tool => tool.name)
    expect(names).toEqual(expect.arrayContaining(['list_tasks', 'list_tables', 'list_data', 'read_records', 'get_item']))
    for (const name of ['list_app_drafts', 'create_app_draft']) {
      expect(names).not.toContain(name)
      await expect(tools.call(name, {})).rejects.toMatchObject({ statusCode: 403 })
    }
  })

  it('authorizes a gateway tool call once', async () => {
    const run = await createAgentRun(env, (await start())!, input())
    db.prepare("UPDATE agent_runs SET status='running' WHERE id=?").run(run.id)
    const timing = requestTiming(env)
    const response = await agentGateway(new Request('http://server/tools', { method: 'POST', headers: { Authorization: `Bearer ${await runCapability(env, run.id)}` }, body: JSON.stringify({ callId: 'c1', name: 'list_tasks', arguments: {} }) }), timing.env, run.id, 'tools', () => {})
    expect(response.status).toBe(200)
    // One Run authorization is 24 statements here; computing it twice took 67 in all.
    expect(timing.summary().d1).toBeLessThan(50)
  })

  it('does not replay a tool whose outcome is uncertain', async () => {
    const run = await createAgentRun(env, (await start())!, input())
    db.prepare("UPDATE agent_runs SET status='running' WHERE id=?").run(run.id)
    db.prepare("INSERT INTO agent_run_tools(run_id,call_id,name,arguments_json,status,created_at) VALUES(?,?,?,'{}','pending','2026-10-21')").run(run.id,'uncertain','list_tasks')
    const response = await agentGateway(new Request('http://server/tools', { method: 'POST', headers: { Authorization: `Bearer ${await runCapability(env, run.id)}` },
      body: JSON.stringify({ callId: 'uncertain', name: 'list_tasks', arguments: {} }) }), env, run.id, 'tools', () => {})
    expect(response.status).toBe(409)
    expect((await findAgentRun(env, run.id))?.status).toBe('failed')
    const retry = await agentGateway(new Request('http://server/tools', { method: 'POST', headers: { Authorization: `Bearer ${await runCapability(env, run.id)}` }, body: JSON.stringify({ callId: 'different-call-id', name: 'list_tasks', arguments: {} }) }), env, run.id, 'tools', () => {})
    expect(retry.status).toBe(403)
  })

  it('keeps manual child admission bounded while model spawning requires review', async () => {
    db.prepare("UPDATE roles SET permissions_bitmask=? WHERE id='agent-role'").run(Permission.sendMessages | Permission.readTasks | Permission.executeTasks | Permission.useComputer)
    db.prepare("INSERT INTO tasks(id,board_id,title,description,status,priority,position,assignee_id,created_by,created_at,updated_at) VALUES('child-task','board-allowed','Research one source','','ready','normal',1,?,'owner-user','2026-10-21','2026-10-21')").run(agentId)
    const parent = await createAgentRun(env, (await start())!, input())
    const tools = agentTools(env, await runAuthorization(env, parent), () => {}, parent)
    await expect(tools.call('execute_task', { taskId: 'child-task' })).rejects.toMatchObject({ statusCode: 403 })
    // The underlying admission contract remains scoped; model invocation additionally requires human review.
    const child = await createAgentRun(env, (await start())!, { ...input(), taskId: 'child-task', idempotencyKey: 'manual-admission-fixture' }, { ...JSON.parse(parent.mandateJson), depth: 1 })
    expect(JSON.parse(child.mandateJson)).toMatchObject({ depth: 1, computer: false, agentResourceAccess: { boards: ['board-allowed'] } })
    const exhausted = { ...child, mandateJson: JSON.stringify({ ...JSON.parse(child.mandateJson), depth: 2 }) }
    await expect(agentTools(env, await runAuthorization(env, exhausted), () => {}, exhausted).call('execute_task', { taskId: 'child-task' })).rejects.toMatchObject({ statusCode: 403 })
  })
  it('routes system instructions and tool results through the real AI SDK adapter', async () => {
    const requests: Array<{ messages: Array<{ role: string; content: string }> }> = []
    env.AI = { run: async (_model: string, body: { messages: Array<{ role: string; content: string }> }) => {
      requests.push(body)
      return { response: 'Verified result', usage: { prompt_tokens: 20, completion_tokens: 3, total_tokens: 23 } }
    } } as unknown as Ai
    const run = await createAgentRun(env, (await start())!, input())
    db.prepare("UPDATE agent_runs SET status='running' WHERE id=?").run(run.id)
    const response = await agentGateway(new Request('http://server/model', { method: 'POST', headers: { Authorization: `Bearer ${await runCapability(env, run.id)}` }, body: JSON.stringify({
      messages: [{ role: 'system', content: 'Stay within the mandate' }, { role: 'user', content: 'Read evidence' },
        { role: 'assistant', content: null, tool_calls: [{ id: 'evidence-call', function: { name: 'list_tasks', arguments: '{}' } }] },
        { role: 'tool', tool_call_id: 'evidence-call', content: 'Authorized evidence' }], stream: true,
    }) }), env, run.id, 'v1/chat/completions', () => {})
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('Verified result')
    expect(requests).toHaveLength(1)
    expect(requests[0]!.messages).toEqual(expect.arrayContaining([{ role: 'system', content: expect.stringContaining('Stay within the mandate') }]))
    expect(requests[0]!.messages.find(message => message.role === 'system')?.content).toContain('Current time:')
    expect(requests[0]!.messages.some(message => message.role === 'tool' && message.content === 'Authorized evidence')).toBe(true)
    expect((await findAgentRun(env, run.id))?.totalTokens).toBe(23)
  })

})

it('snapshots the chosen provider and model per Run and preserves idempotency after a selection change', async () => {
  const { saveAgentProvider } = await import('../../server/utils/agent-providers')
  const { writeServerSetting } = await import('../../shared/server-settings')
  await saveAgentProvider(env, 'openrouter', { enabled: true, webSearch: false, apiKey: 'test-key', models: [{ id: 'first', api: 'chat' }, { id: 'second', api: 'chat' }] })
  await writeServerSetting(env.DB, 'agents.defaultModel', 'zugoid:openrouter:first')
  const first = await createAgentRun(env, (await start())!, input())
  expect(first.model).toBe('zugoid:openrouter:first')
  await writeServerSetting(env.DB, 'agents.conversation.public-chat.model', 'zugoid:openrouter:second')
  expect((await createAgentRun(env, (await start())!, input())).model).toBe(first.model)
  const next = await createAgentRun(env, (await start())!, { ...input(), idempotencyKey: 'different-request' })
  expect(next.model).toBe('zugoid:openrouter:second')
})

it('streams provider text before generation completes instead of buffering the response', async () => {
  let finish!: () => void
  const frame = (delta: unknown, reason: string | null = null) => `data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason: reason }] })}\n\n`
  const encoder = new TextEncoder()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({ start(controller) {
    controller.enqueue(encoder.encode(frame({ role: 'assistant', content: 'Early text' })))
    finish = () => { controller.enqueue(encoder.encode(frame({}, 'stop') + 'data: [DONE]\n\n')); controller.close() }
  } }), { headers: { 'Content-Type': 'text/event-stream' } })))
  try {
    delete env.AI
    Object.assign(env, { AI_BASE_URL: 'https://fixture.invalid/v1', AI_API_KEY: 'fixture-key', AI_MODEL: 'fixture' })
    const run = await createAgentRun(env, (await start())!, input())
    db.prepare("UPDATE agent_runs SET status='running' WHERE id=?").run(run.id)
    const response = await agentGateway(new Request('http://server/model', { method: 'POST', headers: { Authorization: `Bearer ${await runCapability(env, run.id)}` }, body: JSON.stringify({ messages: [{ role: 'user', content: 'Hello' }], stream: true }) }), env, run.id, 'v1/chat/completions', () => {})
    const reader = response.body!.getReader()
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('Early text')
    finish()
    while (!(await reader.read()).done) { /* drain terminal usage and finish */ }
  } finally { vi.unstubAllGlobals() }
})

it('blocks model-selected search while retaining the bounded provider adapter', async () => {
  const { saveAgentProvider } = await import('../../server/utils/agent-providers')
  await saveAgentProvider(env, 'openrouter', { enabled: true, webSearch: true, apiKey: 'search-key', models: [{ id: 'not-selected', api: 'chat' }, { id: 'fixture', api: 'chat' }] })
  const { writeServerSetting } = await import('../../shared/server-settings')
  await writeServerSetting(env.DB, 'ai.function.web.search', JSON.stringify({ model: 'zugoid:openrouter:fixture' }))
  const denied = await createAgentRun(env, (await start())!, input())
  expect(agentTools(env, await runAuthorization(env, denied), () => {}, denied).descriptors.map(t => t.name)).not.toContain('search_web')
  db.prepare("UPDATE roles SET permissions_bitmask=permissions_bitmask|? WHERE id='agent-role'").run(Permission.browseWeb)
  const run = await createAgentRun(env, (await start())!, { ...input(), idempotencyKey: 'web-authorized-run' })
  db.prepare("UPDATE agent_runs SET status='running' WHERE id=?").run(run.id)
  const network = vi.fn(async (_url: unknown, init: RequestInit) => {
    const request: unknown = JSON.parse(String(init.body))
    expect(request).toMatchObject({ model: 'fixture', tools: [{ type: 'openrouter:web_search', parameters: { engine: 'exa', max_uses: 2, max_results: 3, max_characters: 2000 } }] })
    expect(request).not.toHaveProperty('plugins')
    return Response.json({ choices: [{ message: { content: 'Verified source', annotations: [{ type: 'url_citation', url_citation: { url: 'https://example.com/source', title: 'Source' } }] } }], usage: { total_tokens: 42 } })
  })
  vi.stubGlobal('fetch', network)
  try {
    await expect(agentTools(env, await runAuthorization(env, run), () => {}, run).call('search_web', { query: 'Official documentation' })).rejects.toMatchObject({ statusCode: 403 })
    expect(network).not.toHaveBeenCalled()
    const { searchRunWeb } = await import('../../server/utils/agent-search')
    const result = await searchRunWeb(env, run, 'Official documentation')
    expect(result).toMatchObject({ sources: [{ url: 'https://example.com/source' }] })
    expect((await findAgentRun(env, run.id))?.totalTokens).toBe(42)
    db.prepare('UPDATE agent_runs SET model_calls=20 WHERE id=?').run(run.id)
    await expect(searchRunWeb(env, (await findAgentRun(env, run.id))!, 'One more')).rejects.toMatchObject({ statusCode: 400 })
    expect(network).toHaveBeenCalledTimes(1)
  } finally { vi.unstubAllGlobals() }
})

it('returns cited studio and game asset sources in an Agent Run and rejects unsupported links in model text', async () => {
  await saveAgentProvider(env, 'openrouter', { enabled: true, webSearch: true, apiKey: 'search-key', models: [{ id: 'fixture:online', api: 'chat' }] })
  await writeServerSetting(env.DB, 'ai.function.web.search', JSON.stringify({ model: 'zugoid:openrouter:fixture:online' }))
  await writeServerSetting(env.DB, 'agents.executionPolicy', JSON.stringify({ mode: 'role' }))
  db.prepare("UPDATE roles SET permissions_bitmask=permissions_bitmask|? WHERE id='agent-role'").run(Permission.browseWeb)
  const run = await createAgentRun(env, (await start())!, input())
  db.prepare("UPDATE agent_runs SET status='running' WHERE id=?").run(run.id)
  const sources = [
    { url: 'https://www.virtuosgames.com/studio/glass-egg/', title: 'Glass Egg', content: 'Game art studio in Ho Chi Minh City' },
    { url: 'https://store.godotengine.org/asset/kenney/starter-kit-match-3/', title: 'Starter Kit Match-3', content: 'CC0 sprites' },
  ]
  const network = vi.fn<typeof fetch>()
    .mockImplementationOnce(async (_url, init) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({ model: 'fixture' })
      return Response.json({ choices: [{ message: { content: 'Studio and asset examples', annotations: sources.map(source => ({ type: 'url_citation', url_citation: source })) } }], usage: { total_tokens: 52 } })
    })
    .mockImplementationOnce(async () => Response.json({ choices: [{ message: { content: 'Found a [source](https://example.com/unverified)' } }], usage: { total_tokens: 8 } }))
  vi.stubGlobal('fetch', network)
  const search = (callId: string, query: string) => executeRunTool(env, run.id, { callId, name: 'search_web', arguments: { query } }, () => {})
  try {
    await expect(search('cited-sources', 'Find a game art studio in Vietnam and a CC0 Godot puzzle sprite pack')).resolves.toMatchObject({ sources: sources.map(({ url, title, content }) => ({ url, title, excerpt: content })) })
    await expect(search('uncited-sources', 'Find more sources')).rejects.toMatchObject({ statusCode: 502, data: { error: { code: 'search_no_sources' } } })
    expect((await findAgentRun(env, run.id))?.totalTokens).toBe(60)
  } finally { vi.unstubAllGlobals() }
})

it('rejects direct Run admission into a pair DM so replies cannot bypass the message thread', async () => {
  db.exec(`INSERT INTO channels(id,name,type,visibility) VALUES('pair-dm-channel','dm','dm','private'); INSERT INTO channel_members(channel_id,user_id,joined_at) VALUES('pair-dm-channel','owner-user','2026-10-23'),('pair-dm-channel','${agentId}','2026-10-23');`)
  await expect(createAgentRun(env, (await start())!, { ...input(), channelId: 'pair-dm-channel' })).rejects.toMatchObject({ statusCode: 400, data: { error: { code: 'thread_required' } } })
})

it('uses the profile selection before the Server default and fails when that selection is disabled', async () => {
  const { saveAgentProvider } = await import('../../server/utils/agent-providers')
  await saveAgentProvider(env, 'chosen-provider', { kind: 'openrouter', enabled: true, webSearch: false, apiKey: 'fixture-key', models: [{ id: 'chosen', api: 'chat' }] })
  db.prepare('UPDATE agents SET model=? WHERE user_id=?').run('zugoid:chosen-provider:chosen', agentId)
  expect((await createAgentRun(env, (await start())!, input())).model).toBe('zugoid:chosen-provider:chosen')
  await saveAgentProvider(env, 'chosen-provider', { enabled: false, webSearch: false, models: [{ id: 'chosen', api: 'chat' }] })
  await expect(createAgentRun(env, (await start())!, { ...input(), idempotencyKey: 'disabled-selection' })).rejects.toMatchObject({ statusCode: 409 })
})

it('preserves a legacy custom deployment model rather than rejecting it or using the default', async () => {
  Object.assign(env, { AI: undefined, AI_BASE_URL: 'https://inference.example/v1', AI_API_KEY: 'fixture-key', AI_MODEL: 'default-model' })
  db.prepare('UPDATE agents SET model=? WHERE user_id=?').run('legacy/custom-model', agentId)
  const run = await createAgentRun(env, (await start())!, input())
  expect(run.model).toBe('legacy/custom-model')
})

it('resolves an unambiguous legacy OpenRouter ID to its configured connection', async () => {
  const { saveAgentProvider } = await import('../../server/utils/agent-providers')
  await saveAgentProvider(env, 'openrouter', { enabled: true, webSearch: false, apiKey: 'fixture-key', models: [{ id: 'legacy/model', api: 'chat' }] })
  db.prepare('UPDATE agents SET model=? WHERE user_id=?').run('legacy/model', agentId)
  expect((await createAgentRun(env, (await start())!, input())).model).toBe('zugoid:openrouter:legacy/model')
})

it('records a readable provider rejection without leaking its raw response or falling back to another model', async () => {
  const { saveAgentProvider } = await import('../../server/utils/agent-providers')
  await saveAgentProvider(env, 'openrouter', { enabled: true, webSearch: false, apiKey: 'private-provider-key', models: [{ id: 'fixture-model', api: 'chat' }] })
  db.prepare('UPDATE agents SET model=? WHERE user_id=?').run('zugoid:openrouter:fixture-model', agentId)
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: { message: 'Access denied. secret-leak-fixture' } }, { status: 403 })))
  try {
    const run = await createAgentRun(env, (await start())!, input())
    db.prepare("UPDATE agent_runs SET status='running' WHERE id=?").run(run.id)
    const response = await agentGateway(new Request('http://server/model', { method: 'POST', headers: { Authorization: `Bearer ${await runCapability(env, run.id)}` }, body: JSON.stringify({ messages: [{ role: 'user', content: 'Hello' }] }) }), env, run.id, 'v1/chat/completions', () => {})
    expect(response.status).toBe(502)
    expect(await response.text()).toContain('The model provider rejected access')
    expect(fetch).toHaveBeenCalledTimes(1)
    const call = db.prepare('SELECT model,status,error FROM agent_model_calls WHERE run_id=?').get(run.id)
    expect(call).toMatchObject({ model: 'zugoid:openrouter:fixture-model', status: 'failed' })
    expect(JSON.stringify(call)).not.toMatch(/secret-leak-fixture|private-provider-key/u)
  } finally { vi.unstubAllGlobals() }
})

it('persists and wakes a failed chat attempt when its selected model becomes unavailable', async () => {
  db.prepare('INSERT INTO messages(id,channel_id,author_id,content,created_at) VALUES(?,?,?,?,?)').run('source-fixture', 'public-chat', 'owner-user', 'Hello', new Date().toISOString())
  db.prepare('UPDATE agents SET model=? WHERE user_id=?').run('zugoid:missing:disabled', agentId)
  const run = await createAgentRun(env, (await start())!, { ...input(), sourceMessageId: 'source-fixture' })
  expect(run).toMatchObject({ status: 'failed', model: 'zugoid:missing:disabled' })
  expect(run.lastError).toContain('agent model is unavailable')
  expect(wake).toHaveBeenCalledWith(run.id)
  expect(db.prepare('SELECT result_message_id FROM agent_runs WHERE id=?').get(run.id)?.result_message_id).toBeTruthy()
})

it('persists inference budget denial separately from provider rate limits', async () => {
  const run = await createAgentRun(env, (await start())!, input())
  db.prepare("UPDATE agent_runs SET status='running',model_calls=1000 WHERE id=?").run(run.id)
  const response = await agentGateway(new Request('http://server/model', { method: 'POST', headers: { Authorization: `Bearer ${await runCapability(env, run.id)}` }, body: JSON.stringify({ messages: [{ role: 'user', content: 'Hello' }] }) }), env, run.id, 'v1/chat/completions', () => {})
  expect(response.status).toBe(400)
  expect((await findAgentRun(env, run.id))?.lastError).toContain('model-call limit')
  expect(db.prepare('SELECT count(*) AS count FROM agent_model_calls WHERE run_id=?').get(run.id)).toMatchObject({ count: 0 })
})
