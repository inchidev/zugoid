import { z } from 'zod'
import type { RunEnvironment } from '../../shared/code-environments'
import type { ZugoidEnv } from '../../workers/env'
import { pullPath, repositoryClient } from './git-provider'
import { gitlabProject } from './gitlab'
import { gitlabDraftTitle, gitlabFindMergeRequest, gitlabMergeRequest, type GitlabMergeRequest } from './gitlab-proposal'
import { fail } from './cf'

type PullReceipt = { number: number; commit: string; branch: string; url: string }
const sha = z.string().regex(/^[a-f0-9]{40}$/u)
/** GitLab takes a moment after a push to move an existing merge request's head; it is read again a few times. */
async function settledHead(read: () => Promise<GitlabMergeRequest>, expected: string, attempts = 5) {
  let mr = await read()
  for (let attempt = 1; attempt < attempts && mr.head.sha !== expected; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 1000))
    mr = await read()
  }
  return mr
}

/** The GitLab half of a publication: the branch was pushed and checked; open or update its merge request. */
export async function gitlabPublishedPull(env: ZugoidEnv, item: RunEnvironment, input: { branch: string; sha: string; prior: PullReceipt | null; title: string; description: string; ensure: () => Promise<void> }) {
  const { branch, prior, ensure } = input
  const requests = await repositoryClient(env, item, 'source', 'pull_request', ensure)
  const root = gitlabProject(item.sourceRepo)
  const validate = (raw: unknown) => {
    const mr = gitlabMergeRequest.parse(raw)
    if (mr.head.ref !== branch || mr.head.repo.id !== item.sourceRepoId || mr.base.repo.id !== item.sourceRepoId || mr.base.ref !== item.baseBranch || mr.state !== 'open') fail(409, 'factory_pr_changed', 'The canonical merge request identity or state changed')
    return mr
  }
  let mr
  if (prior) mr = await settledHead(async () => validate(await requests.json(`${root}/merge_requests/${prior.number}`)), input.sha)
  else {
    const match = await gitlabFindMergeRequest(requests, item.sourceRepo, branch, item.baseBranch, candidate => candidate.head.repo.id === item.sourceRepoId)
    const opened = validate(match ?? await requests.json(`${root}/merge_requests`, 'POST', { title: gitlabDraftTitle(input.title), description: input.description, source_branch: branch, target_branch: item.baseBranch, remove_source_branch: false }))
    mr = opened.head.sha === input.sha ? opened : await settledHead(async () => validate(await requests.json(`${root}/merge_requests/${opened.number}`)), input.sha)
  }
  if (mr.head.sha !== input.sha) fail(409, 'factory_head_changed', 'Merge request head differs from the approved commit')
  await requests.json(`${root}/merge_requests/${mr.number}`, 'PUT', { title: gitlabDraftTitle(input.title), description: input.description })
  await ensure()
  return { number: mr.number, commit: input.sha, branch, url: requests.web(pullPath('gitlab', mr.number)) } satisfies PullReceipt
}

const safeUrl = (value: string | null | undefined) => {
  try { const url = new URL(value ?? ''); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null } catch { return null }
}
/** A GitLab commit status: one per CI job, or one an outside service set. A CI job's status id is its job id. */
const status = z.object({ id: z.number(), name: z.string(), status: z.string(), allow_failure: z.boolean().optional(), target_url: z.string().nullable().optional() })
/** GitLab's job and pipeline states. A failure GitLab allows does not block, as it does not fail the pipeline. */
export function gitlabState(value: string, allowFailure = false) {
  if (value === 'success') return 'success'
  if (['failed', 'canceled'].includes(value)) return allowFailure ? 'skipped' : 'failure'
  if (value === 'skipped' || (value === 'manual' && allowFailure)) return 'skipped'
  if (['created', 'waiting_for_resource', 'preparing', 'pending', 'scheduled', 'manual', 'waiting_for_callback'].includes(value)) return 'queued'
  return value === 'running' ? 'running' : 'unknown'
}
const jobUrl = (url: string | null, host: string, repository: string) => {
  if (!url) return null
  const parsed = new URL(url)
  if (parsed.origin !== host) return null
  return new RegExp(`^/${repository.replace(/[.]/gu, '\\.')}/-/jobs/(\\d+)$`, 'u').exec(parsed.pathname)?.[1] ?? null
}
/**
 * GitLab reports CI as commit statuses, one per job, and the merge request's head pipeline as a whole. Both
 * count: the pipeline's own state, named `pipeline`, and each job's. A job's log is read from GitLab, bounded.
 */
export async function gitlabFactoryFeedback(env: ZugoidEnv, input: { environment: RunEnvironment; receipt: PullReceipt; jobId?: number; ensure: () => Promise<void> }) {
  const { environment: item, receipt, ensure } = input
  const client = await repositoryClient(env, item, 'source', 'feedback', ensure)
  const root = gitlabProject(item.sourceRepo), host = new URL(client.web()).origin
  const mr = gitlabMergeRequest.parse(await client.json(`${root}/merge_requests/${receipt.number}`))
  if (mr.head.sha !== receipt.commit || mr.head.ref !== receipt.branch || mr.head.repo.id !== item.sourceRepoId || mr.base.repo.id !== item.sourceRepoId || mr.base.ref !== item.baseBranch) fail(409, 'factory_head_changed', 'Canonical merge request head changed; old check results cannot satisfy this head')
  const checks: Array<{ name: string; state: string; url: string | null }> = [], previews: Array<{ state: string; url: string | null; source: string }> = []
  const jobs: Array<{ id: number; name: string; state: string; url: string | null }> = []
  let complete = true
  if (mr.head_pipeline && mr.head_pipeline.sha === receipt.commit) checks.push({ name: 'pipeline', state: gitlabState(mr.head_pipeline.status), url: safeUrl(mr.head_pipeline.web_url) })
  for (let page = 1; page <= 5; page++) {
    // Only the latest status of each name, which is what GitLab lists unless asked for all.
    const statuses = z.array(status).parse(await client.json(`${root}/repository/commits/${receipt.commit}/statuses?per_page=100&page=${page}`))
    for (const entry of statuses) if (!checks.some(check => check.name === entry.name)) {
      const state = gitlabState(entry.status, entry.allow_failure), url = safeUrl(entry.target_url)
      checks.push({ name: entry.name, state, url })
      if (jobUrl(url, host, item.sourceRepo) === String(entry.id)) jobs.push({ id: entry.id, name: entry.name, state, url })
      if (url && item.previewHosts.some(preview => new URL(url).hostname === preview || new URL(url).hostname.endsWith('.' + preview))) previews.push({ state, url, source: entry.name })
    }
    if (statuses.length < 100) break
    if (page === 5) complete = false
  }
  let log: { jobId: number; content: string; truncated: boolean } | undefined
  if (input.jobId) {
    if (!jobs.some(job => job.id === input.jobId)) fail(403, 'factory_logs_denied', 'This job is not associated with the exact merge request head')
    const response = await client.raw(`${root}/jobs/${input.jobId}/trace`)
    if (!response.ok) { await response.body?.cancel(); fail(502, 'factory_logs_unavailable', 'Job logs are unavailable') }
    const reader = response.body?.getReader(), chunks: Uint8Array[] = []
    let size = 0, truncated = false
    if (reader) try { for (;;) { const next = await reader.read(); if (next.done) break; const piece = next.value.slice(0, 64000 - size); chunks.push(piece); size += piece.length; if (size >= 64000) { truncated = true; break } } } finally { await reader.cancel() }
    const joined = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length }
    log = { jobId: input.jobId, content: new TextDecoder().decode(joined), truncated }
  }
  const required = item.requiredChecks.map(name => ({ name, state: checks.find(check => check.name === name)?.state ?? 'absent' }))
  await ensure()
  const final = gitlabMergeRequest.parse(await client.json(`${root}/merge_requests/${receipt.number}`))
  if (final.head.sha !== receipt.commit) fail(409, 'factory_head_changed', 'Merge request head changed while collecting feedback')
  const merge = final.detailed_merge_status
  const state = !checks.length ? 'absent' : checks.some(check => check.state === 'failure') ? 'failure' : checks.some(check => ['running', 'queued'].includes(check.state)) ? 'running' : complete && required.every(check => check.state === 'success') ? 'success' : 'unverified'
  return { checks, required, jobs, log, complete, previews, state,
    previewReason: previews.length ? null : 'No allowed status URL is available',
    providerMergeState: merge === 'mergeable' ? 'clean' : !merge || ['checking', 'unchecked', 'preparing', 'approvals_syncing'].includes(merge) ? 'unknown' : merge === 'draft_status' ? 'draft' : 'blocked',
    requiredChecksAuthority: 'Configured checks are additional requirements. GitLab protected branches, merge checks and approval rules remain authoritative.',
    readyForReview: complete && checks.length > 0 && required.every(check => check.state === 'success') && checks.every(check => ['success', 'skipped'].includes(check.state)) }
}

/** Whether `sha` descends from `old` as GitLab sees it: their merge base is `old` itself. */
export async function gitlabFastForwarded(client: Awaited<ReturnType<typeof repositoryClient>>, repo: string, old: string, head: string) {
  const base = z.object({ id: sha }).parse(await client.json(`${gitlabProject(repo)}/repository/merge_base?${new URLSearchParams([['refs[]', old], ['refs[]', head]])}`))
  return base.id === old
}
