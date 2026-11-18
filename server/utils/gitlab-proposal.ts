import { z } from 'zod'
import type { CodeProposalInput, RunEnvironment } from '../../shared/code-environments'
import type { ZugoidEnv } from '../../workers/env'
import { pullPath, repositoryClient, type RepositoryClient } from './git-provider'
import { gitlabProject, gitlabSegment } from './gitlab'
import { fail } from './cf'

const sha = z.string().regex(/^[a-f0-9]{40}$/u)
/**
 * A GitLab merge request, in the shape the other providers' pull requests have: `number` is its iid (what its
 * page and API name), `head` its source branch and project, `base` its target. `sha` is null while GitLab has
 * not computed the merge request's diff yet.
 */
export const gitlabMergeRequest = z.object({ iid: z.number().int().positive(), state: z.string(), title: z.string(), description: z.string().nullable().optional(), draft: z.boolean().optional(),
  work_in_progress: z.boolean().optional(), sha: sha.nullable(), source_branch: z.string(), target_branch: z.string(), source_project_id: z.number(), target_project_id: z.number(),
  merge_commit_sha: sha.nullable().optional(), squash_commit_sha: sha.nullable().optional(), detailed_merge_status: z.string().optional(), web_url: z.string().optional(),
  head_pipeline: z.object({ id: z.number(), sha, status: z.string(), web_url: z.string().nullable().optional() }).nullable().optional(),
  diff_refs: z.object({ base_sha: sha.nullable(), head_sha: sha.nullable() }).nullable().optional() })
  .transform(mr => ({ ...mr, number: mr.iid, body: mr.description ?? '', merged: mr.state === 'merged', draft: Boolean(mr.draft ?? mr.work_in_progress),
    // GitLab says `opened`; the others say `open`.
    state: mr.state === 'opened' ? 'open' : mr.state,
    head: { ref: mr.source_branch, sha: mr.sha ?? '', repo: { id: mr.source_project_id } }, base: { ref: mr.target_branch, repo: { id: mr.target_project_id } } }))
export type GitlabMergeRequest = z.infer<typeof gitlabMergeRequest>
/** GitLab has no draft flag on create; a `Draft:` title prefix marks the merge request as a draft and blocks merging. */
export const gitlabDraftTitle = (title: string) => `Draft: ${title}`
/** Every prefix GitLab reads as a draft. */
export const GITLAB_DRAFT_PREFIX = /^\s*(?:\[draft\]|\(draft\)|draft:|draft\s+-\s+)\s*/iu

const notFound = (error: unknown) => Boolean(error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404)
/** Where a branch is now, or null when it does not exist. */
export async function gitlabBranchHead(client: RepositoryClient, repo: string, branch: string) {
  try { return z.object({ name: z.string(), commit: z.object({ id: sha }) }).parse(await client.json(`${gitlabProject(repo)}/repository/branches/${gitlabSegment(branch)}`)).commit.id }
  catch (error) { if (notFound(error)) return null; throw error }
}
export async function gitlabCreateBranch(client: RepositoryClient, repo: string, branch: string, commit: string) {
  await client.json(`${gitlabProject(repo)}/repository/branches`, 'POST', { branch, ref: commit })
}
const base64 = (text: string) => { let binary = ''; for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte); return btoa(binary) }
type FileChange = { path: string; content: string | null; executable: boolean }
/** Builds one GitLab commit's actions against the branch's current files. Unlike Gitea, GitLab sets the
 * executable bit itself, so a proposal's flag is kept. */
export async function gitlabFileActions(client: RepositoryClient, repo: string, branch: string, files: FileChange[]) {
  const actions: Array<{ action: 'create' | 'update' | 'delete'; file_path: string; content?: string; encoding?: 'base64'; execute_filemode?: boolean }> = []
  for (const file of files) {
    // A HEAD request answers whether the file exists without its content.
    const response = await client.raw(`${gitlabProject(repo)}/repository/files/${gitlabSegment(file.path)}?ref=${encodeURIComponent(branch)}`, 'HEAD')
    await response.body?.cancel()
    if (!response.ok && response.status !== 404) fail(502, 'gitlab_failed', `GitLab operation failed (${response.status})`)
    const exists = response.ok
    if (file.content === null) { if (exists) actions.push({ action: 'delete', file_path: file.path }); continue }
    actions.push({ action: exists ? 'update' : 'create', file_path: file.path, content: base64(file.content), encoding: 'base64', execute_filemode: file.executable })
  }
  return actions
}
export const gitlabCommitResponse = z.object({ id: sha, parent_ids: z.array(sha).optional() })

/** Finds the merge request for one branch: GitLab filters by source and target branch itself. */
export async function gitlabFindMergeRequest(client: RepositoryClient, repo: string, branch: string, target: string, match: (mr: GitlabMergeRequest) => boolean) {
  const found = z.array(gitlabMergeRequest).parse(await client.json(`${gitlabProject(repo)}/merge_requests?${new URLSearchParams({ source_branch: branch, target_branch: target, per_page: '100' })}`))
  return found.find(match) ?? null
}

type Input = { runId: string; environment: RunEnvironment; input: CodeProposalInput; description: string; branch: string
  proposal: { commitSha: string | null; publishedCommitSha: string | null; pullNumber: number | null }; ensure: () => Promise<void>; recordCommit: (sha: string) => Promise<void> }
/** All writes target the Run's own branch. GitLab writes a commit onto a branch, so the branch starts at the admitted base. */
export async function publishGitlabProposal(env: ZugoidEnv, { runId, environment: item, input, description, branch, proposal, ensure, recordCommit }: Input) {
  const work = await repositoryClient(env, item, 'work', 'work', ensure)
  const target = await repositoryClient(env, item, 'source', 'pull_request', ensure)
  const title = gitlabDraftTitle(input.title)
  const validate = (value: unknown) => {
    const mr = gitlabMergeRequest.parse(value)
    if (mr.head.repo.id !== item.workRepoId || mr.base.repo.id !== item.sourceRepoId || mr.head.ref !== branch || mr.base.ref !== item.baseBranch) fail(409, 'proposal_mismatch', 'Merge request identity changed')
    if (mr.state !== 'open') fail(409, 'proposal_closed', 'This merge request is closed; start a new reviewed task attempt')
    return mr
  }
  const root = gitlabProject(item.sourceRepo)
  if (proposal.pullNumber) validate(await target.json(`${root}/merge_requests/${proposal.pullNumber}`))
  let head = await gitlabBranchHead(work, item.workRepo, branch)
  let commit = proposal.commitSha
  if (!commit) {
    const parent = proposal.publishedCommitSha ?? item.baseSha
    if (!head) {
      if (proposal.publishedCommitSha) fail(409, 'proposal_deleted', 'The working branch was deleted')
      await gitlabCreateBranch(work, item.workRepo, branch, item.baseSha)
      head = await gitlabBranchHead(work, item.workRepo, branch)
    }
    if (head !== parent) fail(409, 'proposal_changed', 'The working branch changed outside this Run')
    const actions = await gitlabFileActions(work, item.workRepo, branch, input.files)
    if (!actions.length) fail(400, 'proposal_empty', 'This proposal changes no files')
    const created = gitlabCommitResponse.parse(await work.json(`${gitlabProject(item.workRepo)}/repository/commits`, 'POST', { branch, commit_message: `${input.title.replace(/[\r\n]/gu, ' ')}\n\nZugoid-Run: ${runId}`, actions }))
    if (created.parent_ids && created.parent_ids[0] !== parent) fail(409, 'proposal_changed', 'The working branch changed while this proposal was written')
    commit = created.id
    await recordCommit(commit)
  } else if (head !== commit) fail(409, 'proposal_changed', 'The working branch changed outside this Run')
  let mr: GitlabMergeRequest
  if (proposal.pullNumber) mr = validate(await target.json(`${root}/merge_requests/${proposal.pullNumber}`))
  else {
    const existing = await gitlabFindMergeRequest(target, item.sourceRepo, branch, item.baseBranch, candidate => candidate.head.repo.id === item.workRepoId)
    if (existing) mr = validate(existing)
    // A fork's merge request is opened from the fork, naming the project it targets.
    else if (item.workRepoId !== item.sourceRepoId) mr = validate(await (await repositoryClient(env, item, 'work', 'pull_request', ensure)).json(`${gitlabProject(item.workRepo)}/merge_requests`, 'POST', {
      title, description, source_branch: branch, target_branch: item.baseBranch, target_project_id: item.sourceRepoId, remove_source_branch: false }))
    else mr = validate(await target.json(`${root}/merge_requests`, 'POST', { title, description, source_branch: branch, target_branch: item.baseBranch, remove_source_branch: false }))
  }
  if (mr.title !== title || mr.body !== description) await target.json(`${root}/merge_requests/${mr.number}`, 'PUT', { title, description })
  return { number: mr.number, url: target.web(pullPath('gitlab', mr.number)), commit }
}
