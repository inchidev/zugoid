import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, it, vi } from 'vitest'
import { d1 } from '../helpers/sqlite-d1'
import { generateAvatar, generateImage, inferAiFunction, saveAiFunction } from '../../server/utils/ai-functions'
import { saveAgentProvider } from '../../server/utils/agent-providers'
import { ALL_PERMISSIONS } from '../../shared/permissions'
import type { AuthorizationContext } from '../../shared/authorization'
import type { ZugoidEnv } from '../../workers/env'

afterEach(() => vi.unstubAllGlobals())

it('uses the real AI SDK and named OpenRouter adapter for a bounded tool-free function call', async () => {
  const db = new DatabaseSync(':memory:')
  db.exec('CREATE TABLE server_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL); CREATE TABLE audit_log(id TEXT,actor_id TEXT,action TEXT,target_type TEXT,target_id TEXT,meta_json TEXT,created_at TEXT)')
  const env = { DB: d1(db), AUTH_SECRET: 'synthetic-function-secret-with-32-characters', RATE_LIMIT_DO: { getByName: () => ({ take: async () => true }) } } as unknown as ZugoidEnv
  const authorization: AuthorizationContext = { serverId: 'server', principal: { id: 'owner', kind: 'human', roleId: 'role', roleName: 'Owner', isOwner: true, permissions: ALL_PERMISSIONS }, credential: { kind: 'session' } }
  const requests: Record<string, unknown>[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    expect(String(url)).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer synthetic-provider-key')
    requests.push(JSON.parse(String(init.body)))
    const frame = (delta: unknown, finish_reason: string | null) => `data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', created: 1, model: 'chosen-model', choices: [{ index: 0, delta, finish_reason }] })}\n\n`
    return new Response(frame({ role: 'assistant', content: '{"sources":[{"index":0,"presentation":"table"}]}' }, null) + frame({}, 'stop') + 'data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } })
  }))
  try {
    await saveAgentProvider(env, 'named', { kind: 'openrouter', enabled: true, webSearch: false, apiKey: 'synthetic-provider-key', models: [{ id: 'chosen-model', api: 'chat', tools: false }] })
    await saveAiFunction(env, authorization, 'apps.assist', { model: 'zugoid:named:chosen-model' })
    const result = await inferAiFunction(env, authorization, 'apps.assist', 'Use only supplied indexes.', 'Synthetic source catalog')
    expect(JSON.parse(result)).toEqual({ sources: [{ index: 0, presentation: 'table' }] })
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({ model: 'chosen-model', stream: true })
    expect(JSON.stringify(requests[0])).toContain('Use only supplied indexes.')
    expect(requests[0]).not.toHaveProperty('tools')
    expect(JSON.stringify(db.prepare('SELECT meta_json FROM audit_log').all())).not.toContain('synthetic-provider-key')
  } finally { db.close() }
})

it('draws an agent picture with the Images model, or the Avatars model when Images has none', async () => {
  const db = new DatabaseSync(':memory:')
  db.exec('CREATE TABLE server_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL); CREATE TABLE audit_log(id TEXT,actor_id TEXT,action TEXT,target_type TEXT,target_id TEXT,meta_json TEXT,created_at TEXT)')
  const env = { DB: d1(db), AUTH_SECRET: 'synthetic-function-secret-with-32-characters', RATE_LIMIT_DO: { getByName: () => ({ take: async () => true }) } } as unknown as ZugoidEnv
  const authorization: AuthorizationContext = { serverId: 'server', principal: { id: 'owner', kind: 'human', roleId: 'role', roleName: 'Owner', isOwner: true, permissions: ALL_PERMISSIONS }, credential: { kind: 'session' } }
  const requests: Record<string, unknown>[] = []
  const png = btoa(String.fromCharCode(137, 80, 78, 71, 1, 2, 3))
  const transport = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    requests.push(JSON.parse(String(init!.body)))
    return Response.json({ choices: [{ message: { images: [{ image_url: { url: `data:image/png;base64,${png}` } }] } }] })
  }) as unknown as typeof fetch
  try {
    // Nothing to draw with: no model chosen and no OpenRouter connection.
    await expect(generateImage(env, authorization, { prompt: 'a knight' }, transport)).rejects.toMatchObject({ statusCode: 409 })
    // An OpenRouter connection alone draws with Nano Banana, even when its stored models do not list it.
    await saveAgentProvider(env, 'router', { kind: 'openrouter', enabled: true, webSearch: false, apiKey: 'synthetic-provider-key', models: [{ id: 'other/painter', api: 'chat', tools: false, outputs: ['image'] }] })
    expect((await generateImage(env, authorization, { prompt: 'a knight' }, transport)).mediaType).toBe('image/png')
    expect(requests.at(-1)).toMatchObject({ model: 'google/gemini-2.5-flash-image' })
    await saveAgentProvider(env, 'router', { kind: 'openrouter', enabled: true, webSearch: false, apiKey: 'synthetic-provider-key', models: [
      { id: 'google/gemini-2.5-flash-image', api: 'chat', tools: false, outputs: ['image', 'text'] }, { id: 'other/painter', api: 'chat', tools: false, outputs: ['image'] }] })
    await saveAiFunction(env, authorization, 'avatar.generate', { model: 'zugoid:router:other/painter' })
    expect((await generateImage(env, authorization, { prompt: 'a knight' }, transport)).mediaType).toBe('image/png')
    expect(requests.at(-1)).toMatchObject({ model: 'other/painter', modalities: ['image', 'text'] })
    await saveAiFunction(env, authorization, 'image.generate', { model: 'zugoid:router:google/gemini-2.5-flash-image' })
    const image = await generateImage(env, authorization, { prompt: 'a fire spell icon on a plain background', aspectRatio: '16:9' }, transport)
    expect(Array.from(image.bytes)).toEqual([137, 80, 78, 71, 1, 2, 3])
    expect(requests.at(-1)).toMatchObject({ model: 'google/gemini-2.5-flash-image', image_config: { aspect_ratio: '16:9' } })
    expect(JSON.stringify(requests.at(-1))).toContain('a fire spell icon')
  } finally { db.close() }
})

it('draws agent pictures and square reference avatars directly with Gemini', async () => {
  const db = new DatabaseSync(':memory:')
  db.exec('CREATE TABLE server_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL); CREATE TABLE audit_log(id TEXT,actor_id TEXT,action TEXT,target_type TEXT,target_id TEXT,meta_json TEXT,created_at TEXT)')
  const env = { DB: d1(db), AUTH_SECRET: 'synthetic-function-secret-with-32-characters',
    RATE_LIMIT_DO: { getByName: () => ({ take: async () => true }) },
    ASSETS: { fetch: async () => new Response(Uint8Array.of(137, 80, 78, 71)) },
  } as unknown as ZugoidEnv
  const authorization: AuthorizationContext = { serverId: 'server', principal: { id: 'owner', kind: 'human', roleId: 'role', roleName: 'Owner', isOwner: true, permissions: ALL_PERMISSIONS }, credential: { kind: 'session' } }
  const requests: Record<string, unknown>[] = []
  const png = 'iVBORw0KGgo='
  const transport = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    expect(String(url)).toBe('https://generativelanguage.googleapis.com/v1beta/interactions')
    expect(new Headers(init?.headers).get('x-goog-api-key')).toBe('synthetic-google-key')
    expect(new Headers(init?.headers).get('Api-Revision')).toBe('2026-05-20')
    expect(init).toMatchObject({ method: 'POST', redirect: 'manual' })
    requests.push(JSON.parse(String(init?.body)))
    return Response.json({ steps: [
      { type: 'thought', content: [{ type: 'image', mime_type: 'image/png', data: 'AQID' }] },
      { type: 'model_output', content: [{ type: 'text', text: 'Generated a picture.' }, { type: 'image', mime_type: 'image/png', data: png }] },
    ] })
  })
  try {
    await saveAgentProvider(env, 'direct', { kind: 'google', enabled: true, webSearch: false, apiKey: 'synthetic-google-key',
      models: [{ id: 'gemini-nano-banana-2.1', api: 'google' }, { id: 'gemini-3.1-flash-lite-image', api: 'google' }] })
    await saveAiFunction(env, authorization, 'avatar.generate', { model: 'zugoid:direct:gemini-3.1-flash-lite-image' })
    const avatar = await generateAvatar(env, authorization, { name: 'Cloud', references: ['data:image/jpeg;base64,/9j/4AAQ'], zugoidStyle: true }, transport)
    expect(avatar).toBe(`data:image/png;base64,${png}`)
    expect(requests[0]).toMatchObject({
      model: 'gemini-3.1-flash-lite-image', store: false, response_format: { type: 'image', aspect_ratio: '1:1' },
      input: [
        { type: 'text', text: expect.stringContaining('Zugoid house style') },
        { type: 'image', mime_type: 'image/png', data: 'iVBORw==' },
        { type: 'image', mime_type: 'image/jpeg', data: '/9j/4AAQ' },
      ],
    })
    const fallback = await generateImage(env, authorization, { prompt: 'a lighthouse' }, transport)
    expect(fallback.mediaType).toBe('image/png')
    expect(requests[1]).toMatchObject({ model: 'gemini-3.1-flash-lite-image', response_format: { type: 'image' } })
    await saveAiFunction(env, authorization, 'image.generate', { model: 'zugoid:direct:gemini-nano-banana-2.1' })
    const picture = await generateImage(env, authorization, { prompt: 'private image request', aspectRatio: '16:9' }, transport)
    expect(Array.from(picture.bytes)).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    expect(requests[2]).toMatchObject({ model: 'gemini-nano-banana-2.1', store: false, response_format: { type: 'image', aspect_ratio: '16:9' },
      input: [{ type: 'text', text: expect.stringContaining('private image request') }] })
    expect(requests[2]).not.toHaveProperty('tools')

    transport.mockResolvedValueOnce(Response.json({ steps: [{ type: 'model_output', content: [{ type: 'image', uri: 'https://example.com/image.png' }] }] }))
    await expect(generateImage(env, authorization, { prompt: 'a lighthouse' }, transport)).rejects.toMatchObject({ statusCode: 502 })
    transport.mockResolvedValueOnce(new Response('private provider diagnostic', { status: 403 }))
    await expect(generateAvatar(env, authorization, { name: 'Cloud' }, transport)).rejects.toMatchObject({ statusCode: 502, data: { error: { message: expect.not.stringContaining('private provider diagnostic') } } })
    const audit = JSON.stringify(db.prepare('SELECT meta_json FROM audit_log').all())
    expect(audit).not.toContain('synthetic-google-key')
    expect(audit).not.toContain('private image request')
    expect(audit).not.toContain('/9j/4AAQ')
  } finally { db.close() }
})
