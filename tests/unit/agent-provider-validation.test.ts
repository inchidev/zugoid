import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { d1 } from '../helpers/sqlite-d1'
import { loadAgentProvider, saveAgentProvider } from '../../server/utils/agent-providers'
import { discoverAgentModels } from '../../server/utils/agent-provider-models'
import { assertAgentModelSupportsTools } from '../../server/utils/agent-model-options'
import { agentProviderSchema } from '../../shared/agent-providers'
import type { ZugoidEnv } from '../../workers/env'

let db: DatabaseSync, env: ZugoidEnv
beforeEach(() => {
  db = new DatabaseSync(':memory:')
  db.exec('CREATE TABLE server_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL)')
  env = { DB: d1(db), AUTH_SECRET: 'fixture-secret-32-characters-long-only' } as ZugoidEnv
})
afterEach(() => db.close())
const models = [{ id: 'vendor/tools', api: 'chat' as const, tools: true }, { id: 'vendor/text-only', api: 'chat' as const, tools: false }, { id: 'vendor/unknown', api: 'chat' as const }]

it('accepts an empty connection name and saves the provider name instead', async () => {
  const input = agentProviderSchema.parse({ kind: 'openrouter', name: '  ', enabled: true, apiKey: 'provider-secret-fixture', models })
  await saveAgentProvider(env, 'work', input)
  expect((await loadAgentProvider(env, 'work'))?.name).toBe('OpenRouter')
  await saveAgentProvider(env, 'work', { ...input, name: 'Work', apiKey: undefined })
  expect((await loadAgentProvider(env, 'work'))?.name).toBe('Work')
  // Omitting the name keeps it; clearing it returns to the provider name.
  await saveAgentProvider(env, 'work', { ...input, name: undefined, apiKey: undefined })
  expect((await loadAgentProvider(env, 'work'))?.name).toBe('Work')
  await saveAgentProvider(env, 'work', { ...input, name: '', apiKey: undefined })
  expect((await loadAgentProvider(env, 'work'))?.name).toBe('OpenRouter')
})

it('explains an overlong connection name instead of a raw length error', () => {
  const result = agentProviderSchema.safeParse({ name: 'x'.repeat(81), enabled: true, models: [] })
  expect(result.success).toBe(false)
  expect(result.error?.issues[0]?.message).toBe('Connection name must be 80 characters or fewer')
})

it('refuses a text-only model for an agent and allows tool-capable or unmarked models', async () => {
  await saveAgentProvider(env, 'work', { kind: 'openrouter', enabled: true, webSearch: false, apiKey: 'provider-secret-fixture', models })
  await expect(assertAgentModelSupportsTools(env, 'zugoid:work:vendor/text-only')).rejects.toMatchObject({ statusCode: 400, data: { error: { code: 'model_without_tools' } } })
  await expect(assertAgentModelSupportsTools(env, 'zugoid:work:vendor/tools')).resolves.toBeUndefined()
  await expect(assertAgentModelSupportsTools(env, 'zugoid:work:vendor/unknown')).resolves.toBeUndefined()
  await expect(assertAgentModelSupportsTools(env, '')).resolves.toBeUndefined()
  await expect(assertAgentModelSupportsTools(env, '@cf/deployment/model')).resolves.toBeUndefined()
})

it('discovers general Gemini models with Google authentication and provider limits', async () => {
  const transport = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
    expect(String(url)).toBe('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000')
    expect(new Headers(options?.headers).get('x-goog-api-key')).toBe('synthetic-google-key')
    return Response.json({ models: [
      { name: 'models/gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', supportedGenerationMethods: ['generateContent'], inputTokenLimit: 1048576, outputTokenLimit: 65536 },
      { name: 'models/gemini-embedding', supportedGenerationMethods: ['embedContent'] },
      { name: 'models/gemini-3-pro-image-preview', supportedGenerationMethods: ['generateContent'] },
    ] })
  })
  try {
    const models = await discoverAgentModels('google', 'synthetic-google-key')
    expect(models).toMatchObject([{ id: 'gemini-3.8-flash', api: 'google', inputs: expect.arrayContaining(['video']), contextWindow: 1048576, maxOutputTokens: 65536 }])
    await saveAgentProvider(env, 'direct-google', { kind: 'google', enabled: true, webSearch: false, apiKey: 'synthetic-google-key', models })
    expect((await loadAgentProvider(env, 'direct-google'))?.name).toBe('Google Gemini')
  } finally { transport.mockRestore() }
})
