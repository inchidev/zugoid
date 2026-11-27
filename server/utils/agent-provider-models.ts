import { z } from 'zod'
import { agentModelInputs, providerModelApi, type AgentModelInput, type AgentProviderId, type AgentProviderModel } from '../../shared/agent-providers'
import { fail } from './cf'
import { readLimitedStream } from '../../workers/inbound-email-signature'

/** Known origins only: a submitted provider never supplies a URL for credential-bearing requests. */
export async function discoverAgentModels(kind: AgentProviderId, apiKey?: string): Promise<AgentProviderModel[]> {
  if (!apiKey && kind !== 'openrouter') fail(400, 'key_required', 'Enter an API key before loading models')
  const url = kind === 'openrouter' ? 'https://openrouter.ai/api/v1/models' : kind === 'anthropic' ? 'https://api.anthropic.com/v1/models?limit=1000' : kind === 'google'
    ? 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000' : 'https://api.openai.com/v1/models'
  const headers: Record<string, string> = kind === 'anthropic' ? { 'x-api-key': apiKey ?? '', 'anthropic-version': '2023-06-01' }
    : kind === 'google' ? { 'x-goog-api-key': apiKey ?? '' } : apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(15000), redirect: 'manual' })
  if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); fail(502, 'catalog_redirect', 'The provider returned an unexpected redirect. Check its configuration.') }
  if ([401, 403].includes(response.status)) { await response.body?.cancel(); fail(400, 'provider_auth', 'The provider rejected this API key. Check the key and account access.') }
  const body = await readLimitedStream(response.body, 5000000)
  if (!response.ok || !body.ok) fail(502, 'catalog_failed', 'Could not load models. Check the connection and try again.')
  const raw = z.object({ data: z.array(z.record(z.string(), z.unknown())).optional(), models: z.array(z.record(z.string(), z.unknown())).optional() }).parse(JSON.parse(new TextDecoder().decode(body.bytes)))
  return (raw.data ?? raw.models ?? []).flatMap<AgentProviderModel>(row => {
    if (kind === 'google') return googleCatalogModel(row) ?? []
    const id = kind === 'chatgpt' ? row.slug : row.id
    if (typeof id !== 'string' || !id || id.length > 160 || (kind === 'chatgpt' && row.visibility !== 'list')) return []
    const api = providerModelApi[kind]
    const label = row.display_name ?? row.name ?? id
    return [{ id, label: typeof label === 'string' ? label.slice(0, 200) : id, api, ...capabilities(kind, row) }]
  })
}

const tokens = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 100_000_000 ? value : undefined

/** Gemini's catalog reports generation methods and limits. General Gemini models accept video. */
function googleCatalogModel(row: Record<string, unknown>): AgentProviderModel | null {
  if (typeof row.name !== 'string' || !/^models\/gemini-[a-z0-9.-]+$/u.test(row.name)) return null
  if (!Array.isArray(row.supportedGenerationMethods) || !row.supportedGenerationMethods.includes('generateContent')) return null
  const id = row.name.slice('models/'.length)
  if (id.length > 160 || /(?:image|tts|live|audio|robotics|embedding|transcribe|translate|computer-use|deep-research)/u.test(id)) return null
  return {
    id, label: typeof row.displayName === 'string' ? row.displayName.slice(0, 200) : id, api: 'google',
    inputs: ['text', 'image', 'audio', 'video', 'file'], outputs: ['text'],
    contextWindow: tokens(row.inputTokenLimit), maxOutputTokens: tokens(row.outputTokenLimit),
    ...(typeof row.thinking === 'boolean' ? { reasoning: row.thinking } : {}),
  }
}

/** What a model accepts and whether it reasons, as the provider catalog reports it. */
function capabilities(kind: AgentProviderId, row: Record<string, unknown>): Pick<AgentProviderModel, 'tools' | 'inputs' | 'outputs' | 'reasoning' | 'contextWindow' | 'maxOutputTokens'> {
  // Kept when the catalog reports them (OpenRouter: the window and its top provider's answer limit);
  // otherwise the Run takes them from Pi's catalog.
  const top = row.top_provider && typeof row.top_provider === 'object' ? row.top_provider as Record<string, unknown> : null
  const contextWindow = tokens(kind === 'anthropic' ? row.max_input_tokens : row.context_length)
  const maxOutputTokens = tokens(kind === 'anthropic' ? row.max_tokens : top?.max_completion_tokens)
  const limits = { ...(contextWindow ? { contextWindow } : {}), ...(maxOutputTokens ? { maxOutputTokens } : {}) }
  // Every current Claude and ChatGPT/Codex model reads images; their catalogs do not list modalities.
  if (kind !== 'openrouter') return { inputs: ['text', 'image', ...(kind === 'anthropic' ? ['file' as const] : [])], ...limits }
  const parameters = Array.isArray(row.supported_parameters) ? row.supported_parameters : null
  const architecture = row.architecture && typeof row.architecture === 'object' ? row.architecture as Record<string, unknown> : null
  const known = (value: unknown) => Array.isArray(value) ? value.filter((item): item is AgentModelInput => agentModelInputs.includes(item as AgentModelInput)) : null
  const inputs = known(architecture?.input_modalities), outputs = known(architecture?.output_modalities)
  return { ...(parameters ? { tools: parameters.includes('tools'), reasoning: parameters.includes('reasoning') || parameters.includes('reasoning_effort') } : {}), ...(inputs ? { inputs } : {}), ...(outputs ? { outputs } : {}), ...limits }
}
