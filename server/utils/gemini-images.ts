import { z } from 'zod'
import type { AgentProviderModel } from '../../shared/agent-providers'
import type { ImageAspectRatio } from '../../shared/ai-functions'
import { readLimitedStream } from '../../workers/inbound-email-signature'
import { fail } from './cf'
import { inferenceFailure } from './agent-inference-errors'

/** Gemini's Models API does not report output modalities. Keep the published image model IDs here. */
const imageModels = new Set([
  'gemini-nano-banana-2.1',
  'gemini-3.1-flash-lite-image',
  'gemini-3.1-flash-image',
  'gemini-3-pro-image',
  'gemini-3-pro-image-preview',
  'gemini-2.5-flash-image',
])
export function isGeminiImageModel(id: string): boolean {
  return imageModels.has(id)
}

/** Capabilities exposed by the drawing transport. */
export const geminiDrawingCapabilities: Pick<AgentProviderModel, 'tools' | 'inputs' | 'outputs'> = {
  tools: false, inputs: ['text', 'image'], outputs: ['image'],
}

const imageType = z.enum(['image/png', 'image/jpeg', 'image/webp'])
const picture = z.object({
  type: z.literal('image'),
  mime_type: imageType,
  data: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/u).refine(value => value.endsWith('=') ? value.length % 4 === 0 : value.length % 4 !== 1),
})
const responseSchema = z.object({
  steps: z.array(z.looseObject({ type: z.string() })),
})

/** A stateless Interactions call keeps reference images and prompt out of a reusable Google interaction. */
export async function drawWithGemini(apiKey: string, model: string, request: string, images: string[], options: { aspectRatio?: ImageAspectRatio }, transport: typeof fetch): Promise<string> {
  const response = await transport('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(120_000),
    headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json', 'Api-Revision': '2026-05-20' },
    body: JSON.stringify({
      model, store: false,
      input: [{ type: 'text', text: request }, ...images.map(url => {
        const [, mime_type, data] = /^data:(image\/[a-z]+);base64,(.+)$/u.exec(url)!
        return { type: 'image', mime_type, data }
      })],
      response_format: { type: 'image', ...(options.aspectRatio ? { aspect_ratio: options.aspectRatio } : {}) },
    }),
  }).catch(error => fail(502, 'ai_function_failed', inferenceFailure(error)))
  if (!response.ok) {
    await response.body?.cancel()
    const message = [400, 404, 422].includes(response.status)
      ? 'Gemini did not accept the image request. Check the Google key, selected model and reference images.'
      : inferenceFailure({ status: response.status })
    fail(502, 'ai_function_failed', message)
  }
  const body = await readLimitedStream(response.body, 16_000_000)
  if (!body.ok) fail(502, 'ai_function_failed', 'The image model returned an empty or oversized response')
  let raw: unknown
  try { raw = JSON.parse(new TextDecoder().decode(body.bytes)) }
  catch { fail(502, 'ai_function_failed', 'The image model returned an unreadable response') }

  const steps = responseSchema.safeParse(raw).data?.steps ?? []
  for (const step of steps) {
    if (step.type !== 'model_output' || !Array.isArray(step.content)) continue
    for (const part of step.content) {
      const image = picture.safeParse(part).data
      if (image) return `data:${image.mime_type};base64,${image.data}`
    }
  }
  fail(502, 'ai_function_failed', 'The image model returned no usable picture. Try again or choose another model.')
}
