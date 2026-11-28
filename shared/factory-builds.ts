import { z } from 'zod'

const target = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('unot'), game: z.string().regex(/^[a-z][a-z0-9]{0,15}$/) }).strict(),
  z.object({ kind: z.literal('app'), app: z.string().min(1).max(80) }).strict(),
])

export const pipelineTargets = z.record(z.string(), target)
export type PipelineTarget = z.infer<typeof target>

export const buildInput = z.object({
  repoId: z.string().min(1).max(100),
  ref: z.string().max(200).regex(/^refs\/(heads|tags)\/[a-zA-Z0-9][a-zA-Z0-9_./-]*$/)
    .refine(ref => !ref.includes('..') && !ref.includes('//') && !ref.endsWith('/') && !ref.endsWith('.lock')),
}).strict()

export type ProjectBuild = {
  id: string
  repositoryId: string
  ref: string
  sha: string
  state: 'queued' | 'starting' | 'running' | 'ready' | 'failed'
  log: string
  digest: string | null
  previewUrl: string | null
  appRevision: number | null
  publishedVersion: number | null
  createdAt: string
}
