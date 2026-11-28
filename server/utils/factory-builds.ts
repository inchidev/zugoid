import { z } from 'zod'
import { buildInput, pipelineTargets, type ProjectBuild, type PipelineTarget } from '../../shared/factory-builds'
import { gadgetPath } from '../../shared/paths'
import { newId, nowIso } from '../../shared/ids'
import type { ZugoidEnv } from '../../workers/env'
import { artifactsGrant, artifactsHead } from './factory-artifacts'
import { BUILD_LIFETIME, BUILD_LIMIT, buildLog, checkout, launchBuild, readSandboxFile, startSandbox, stopSandbox } from './factory-lizard'
import { getGadgetDetail, publishGadget } from './gadget-catalog'
import { gadgetSpecSchema } from './gadget-spec'
import { previewGadgetBuild } from './gadget-runtime'
import { fail } from './cf'
import type { Membership } from './guards'
import { listProjectRepositories, requireProject } from './project-service'

type BuildRow = ProjectBuild & { sandbox: string | null; destination: string; startedAt: string | null }
const columns = 'id, repository_id AS repositoryId, ref, sha, state, destination, sandbox, log, digest, preview_url AS previewUrl, app_revision AS appRevision, published_version AS publishedVersion, created_at AS createdAt, started_at AS startedAt'
const gameOutput = z.object({ files: z.record(z.string(), z.base64()) }).strict()
const appOutput = z.object({ spec: gadgetSpecSchema, name: z.string().trim().min(1).max(80).optional(), description: z.string().max(500).optional() }).strict()
const unotResult = z.object({ game: z.string(), digest: z.string(), previewUrl: z.url() })
const objectKey = (project: string, build: string) => `factory-builds/${project}/${build}.json`
const gameOrigin = 'https://dev.unot.app'

function destination(env: ZugoidEnv, project: string): PipelineTarget | undefined {
  try { return pipelineTargets.parse(JSON.parse(env.FACTORY_PIPELINE_PROJECTS || '{}'))[project] }
  catch { fail(409, 'build_config_invalid', 'Factory project bindings are invalid') }
}

function present({ sandbox: _sandbox, destination: _destination, startedAt: _startedAt, ...row }: BuildRow): ProjectBuild { return row }

function configured(env: ZugoidEnv, project: string) {
  return !!env.FACTORY_LIZARD_KEY && !!env.FACTORY_LIZARD_PROJECT && !!env.FILES && !!destination(env, project)
}

async function find(env: ZugoidEnv, project: string, build: string) {
  const row = await env.DB.prepare(`SELECT ${columns} FROM project_builds WHERE id=? AND project_id=?`).bind(build, project).first<BuildRow>()
  if (!row) fail(404, 'build_not_found', 'Build not found')
  return row
}

export async function listBuilds(env: ZugoidEnv, actor: Membership, project: string) {
  await requireProject(env, actor.authorization, project)
  const { results } = await env.DB.prepare(`SELECT ${columns} FROM project_builds WHERE project_id=? ORDER BY created_at DESC,id DESC LIMIT 50`).bind(project).all<BuildRow>()
  return { configured: configured(env, project),
    builds: results.map(present) }
}

export async function createBuild(env: ZugoidEnv, actor: Membership, project: string, body: unknown) {
  if ((await requireProject(env, actor.authorization, project, true)).archivedAt) fail(409, 'project_archived', 'Restore the project first')
  if (!configured(env, project)) fail(409, 'build_config_missing', 'Configure the project destination, Lizard and private file storage first')
  const input = buildInput.parse(body)
  const repo = (await listProjectRepositories(env, actor.authorization, project)).find(r => r.id === input.repoId && r.provider === 'artifacts')
  if (!repo) fail(404, 'build_repo_missing', 'Select an Artifacts repository attached to this project')
  const commit = await artifactsHead(env, repo.slug, input.ref)
  if (!commit) fail(404, 'build_ref_missing', 'Git ref not found')
  const id = await enqueueBuild(env, project, repo.id, input.ref, commit)
  if (!id) fail(409, 'build_config_missing', 'Build is unavailable for this project')
  await wakeBuilds(env, project)
  return present(await find(env, project, id))
}

async function wakeBuilds(env: ZugoidEnv, project: string) {
  const runner = env.SERVER_DO.getByName('factory-builds:' + project) as unknown as { runFactoryBuilds(): Promise<void> }
  await runner.runFactoryBuilds()
}

async function enqueueBuild(env: ZugoidEnv, project: string, repository: string, ref: string, commit: string, automatic = false) {
  const target = destination(env, project)
  if (!target) return null
  const queued = await env.DB.prepare(`INSERT INTO project_builds (id, project_id, repository_id, ref, sha, state, destination, created_at)
    SELECT ?,r.project_id,r.id,?,?,'queued',?,? FROM project_repositories r JOIN projects p ON p.id=r.project_id
    WHERE r.project_id=? AND r.id=? AND p.archived_at IS NULL AND r.provider='artifacts' AND NOT EXISTS (
      SELECT 1 FROM project_builds WHERE project_id=? AND repository_id=? AND ref=? AND sha=? AND destination=?
      AND (state IN ('queued','starting','running') OR ?=1)
    ) RETURNING id`).bind(newId(), ref, commit, JSON.stringify(target), nowIso(), project, repository,
      project, repository, ref, commit, JSON.stringify(target), automatic ? 1 : 0).first<{ id: string }>()
  if (queued) return queued.id
  return (await env.DB.prepare(`SELECT id FROM project_builds WHERE project_id=? AND repository_id=? AND ref=? AND sha=? AND destination=?
    AND state IN ('queued','starting','running')`).bind(project, repository, ref, commit, JSON.stringify(target)).first<{ id: string }>())?.id ?? null
}

/** The Git operation is authoritative. Committed results survive a runner interruption. */
export async function afterArtifactChange(env: ZugoidEnv, source: { repositoryId: string } | { environmentId: string }, ref: string, commit: string) {
  if (!env.FACTORY_LIZARD_KEY || !env.FACTORY_LIZARD_PROJECT || !env.FILES) return
  try {
    const by = 'repositoryId' in source ? 'id' : 'environment_id'
    const value = 'repositoryId' in source ? source.repositoryId : source.environmentId
    const row = await env.DB.prepare(`SELECT id, project_id AS project FROM project_repositories WHERE ${by}=? AND provider='artifacts'`)
      .bind(value).first<{ id: string; project: string }>()
    if (!row || !configured(env, row.project)) return
    const input = buildInput.parse({ repoId: row.id, ref })
    if (await enqueueBuild(env, row.project, input.repoId, input.ref, commit, true)) await wakeBuilds(env, row.project)
  } catch { console.warn('Factory could not enqueue a build after an Artifacts change') }
}

export async function artifactBuildCheck(env: ZugoidEnv, environment: string, branch: string, sha: string) {
  if (!env.FACTORY_LIZARD_KEY || !env.FACTORY_LIZARD_PROJECT || !env.FILES) return null
  const repo = await env.DB.prepare("SELECT id,project_id AS project FROM project_repositories WHERE environment_id=? AND provider='artifacts'")
    .bind(environment).first<{ id: string; project: string }>()
  if (!repo || !configured(env, repo.project)) return null
  const row = await env.DB.prepare(`SELECT state,log FROM project_builds WHERE repository_id=? AND ref=? AND sha=?
    AND destination=? ORDER BY created_at DESC,id DESC LIMIT 1`)
    .bind(repo.id, `refs/heads/${branch}`, sha, JSON.stringify(destination(env, repo.project)))
    .first<Pick<ProjectBuild, 'state' | 'log'>>()
  const state = row?.state === 'ready' ? 'success' : row?.state === 'failed' ? 'failure' : 'running'
  const check = { name: 'Factory build', state, url: null }
  return { state, readyForReview: state === 'success', complete: state !== 'running',
    checks: [check], required: [check], log: row?.log, requiredChecksAuthority: 'Project Builds checks the approved commit.' }
}

async function startBuild(env: ZugoidEnv, project: string, id: string) {
  const build = await find(env, project, id)
  if (build.state !== 'queued') return present(build)
  const claim = await env.DB.prepare(`UPDATE project_builds SET state='starting', started_at=? WHERE id=? AND state='queued'
    AND NOT EXISTS (SELECT 1 FROM project_builds WHERE project_id=? AND state IN ('starting','running'))
    RETURNING id`).bind(nowIso(), id, project).first()
  if (!claim) return present(await find(env, project, id))

  let sandbox: string | undefined
  try {
    const repo = await env.DB.prepare(`SELECT r.slug FROM project_repositories r JOIN projects p ON p.id=r.project_id
      WHERE r.project_id=? AND r.id=? AND r.provider='artifacts' AND p.archived_at IS NULL`)
      .bind(project, build.repositoryId).first<{ slug: string }>()
    if (!repo || JSON.stringify(destination(env, project)) !== build.destination) fail(409, 'build_config_changed', 'Project configuration changed')
    sandbox = await startSandbox(env)
    await env.DB.prepare('UPDATE project_builds SET sandbox=? WHERE id=?').bind(sandbox, id).run()
    const grant = await artifactsGrant(env, repo.slug, 'read')
    try { await checkout(env, sandbox, grant, build.ref, build.sha) }
    finally { await grant.revoke() }
    await launchBuild(env, sandbox)
    await env.DB.prepare("UPDATE project_builds SET state='running' WHERE id=?").bind(id).run()
  } catch {
    await env.DB.prepare("UPDATE project_builds SET state='failed', sandbox=NULL, log=? WHERE id=?").bind('Lizard could not start this build. Check runner configuration and factory.sh.', id).run()
    if (sandbox) await stopSandbox(env, sandbox)
  }
  return present(await find(env, project, id))
}

async function digest(text: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('')
}

/** Called by the project's alarm, including when its Builds page is closed. */
export async function advanceFactoryBuilds(env: ZugoidEnv, project: string) {
  const build = await env.DB.prepare(`SELECT ${columns} FROM project_builds WHERE project_id=? AND state IN ('queued','starting','running')
    ORDER BY (state='queued'), created_at, id LIMIT 1`).bind(project).first<BuildRow>()
  if (!build) return false
  if (build.state === 'queued') await startBuild(env, project, build.id)
  else await settleBuild(env, build, project)
  return true
}

async function settleBuild(env: ZugoidEnv, build: BuildRow, project: string) {
  const id = build.id
  const sandbox = build.sandbox
  if (build.startedAt && Date.now() - Date.parse(build.startedAt) >= BUILD_LIFETIME) {
    await env.DB.prepare("UPDATE project_builds SET state='failed', log=?, sandbox=NULL WHERE id=? AND state IN ('running','starting')")
      .bind('The build sandbox expired.', id).run()
    if (sandbox) await stopSandbox(env, sandbox)
    return
  }
  if (!sandbox || build.state !== 'running') return
  const exit = await readSandboxFile(env, sandbox, '/tmp/factory-exit', 100)
  if (exit === null) return
  const rawLog = await buildLog(env, sandbox)
  // eslint-disable-next-line no-control-regex -- discard terminal colour escapes and NULs from command output
  let log = rawLog.replace(/\u001b\[[0-9;]*m|\u0000/g, '').slice(-6000)
  let checksum: string | null = null
  if (exit.trim() === '0') {
    try {
      const content = await readSandboxFile(env, sandbox, '/tmp/factory/factory-build.json', BUILD_LIMIT)
      const target = JSON.parse(build.destination) as PipelineTarget
      if (!content || !env.FILES) throw new Error('Missing build output')
      const parsed = JSON.parse(content)
      const output = target.kind === 'unot' ? gameOutput.parse(parsed) : appOutput.parse(parsed)
      const normalized = JSON.stringify(output)
      checksum = target.kind === 'unot' && 'files' in output
        ? await digest(JSON.stringify(Object.entries(output.files).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)))
        : await digest(normalized)
      await env.FILES.put(objectKey(project, id), JSON.stringify({ target, output }))
    } catch { checksum = null; log = (log + '\nThe checked build did not produce a valid factory-build.json.').slice(-6000) }
  }
  await env.DB.prepare("UPDATE project_builds SET state=?,log=?,digest=?,sandbox=NULL WHERE id=? AND state='running'")
    .bind(checksum ? 'ready' : 'failed', log, checksum, id).run()
  await stopSandbox(env, sandbox)
}

async function isProjectRelease(env: ZugoidEnv, project: string, build: BuildRow) {
  if (!build.ref.startsWith('refs/tags/')) return false
  return !!await env.DB.prepare('SELECT 1 FROM project_releases WHERE project_id=? AND repository_id=? AND tag=? AND sha=?')
    .bind(project, build.repositoryId, build.ref.slice('refs/tags/'.length), build.sha).first()
}

export async function stageBuild(env: ZugoidEnv, actor: Membership, project: string, id: string) {
  await requireProject(env, actor.authorization, project, true)
  const build = await find(env, project, id)
  if (build.state !== 'ready' || !build.digest) fail(409, 'build_not_ready', 'Run the build and wait for its checks first')
  if (build.previewUrl) return present(build)
  const object = await env.FILES?.get(objectKey(project, id))
  if (!object) fail(409, 'build_missing', 'The checked build is unavailable')
  const envelope = await object.json<{ target: PipelineTarget; output: unknown }>()
  const target = destination(env, project)
  if (JSON.stringify(target) !== JSON.stringify(envelope.target) || !target) fail(409, 'build_target_changed', 'The project target changed. Build again.')

  let url: string
  let revision: number | null = null
  if (target.kind === 'unot') {
    if (!env.FACTORY_UNOT_KEY) fail(409, 'unot_target_missing', 'Connect the studio build credential')
    const payload = gameOutput.parse(envelope.output)
    const response = await fetch(gameOrigin + '/internal/factory/heavy', { method: 'POST', redirect: 'manual',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.FACTORY_UNOT_KEY },
      body: JSON.stringify({ game: target.game, commit: build.sha, digest: build.digest, files: payload.files,
        release: await isProjectRelease(env, project, build) }),
      signal: AbortSignal.timeout(45_000) })
    if (!response.ok) fail(502, 'unot_target_failed', 'Unot refused the private build')
    const result = unotResult.parse(await response.json())
    const preview = new URL(result.previewUrl)
    if (result.game !== target.game || result.digest !== build.digest || preview.origin !== gameOrigin
        || !new RegExp(`^/app/game/${target.game}:v[1-9][0-9]*$`).test(preview.pathname)) {
      fail(502, 'unot_target_failed', 'Unot returned an unexpected version')
    }
    url = preview.href
  } else {
    const payload = appOutput.parse(envelope.output)
    const preview = await previewGadgetBuild(env, actor, target.app, payload)
    revision = preview.gadget.version
    url = gadgetPath(target.app) + '&' + new URLSearchParams({ preview: '1', factory: project, build: id })
  }
  await env.DB.prepare('UPDATE project_builds SET preview_url=?,app_revision=? WHERE id=? AND preview_url IS NULL')
    .bind(url, revision, id).run()
  return present(await find(env, project, id))
}

async function appArtifact(env: ZugoidEnv, actor: Membership, project: string, id: string) {
  await requireProject(env, actor.authorization, project)
  const build = await find(env, project, id)
  const target = destination(env, project)
  if (target?.kind !== 'app' || JSON.stringify(target) !== build.destination || build.state !== 'ready' || build.appRevision === null) {
    fail(409, 'build_not_ready', 'Stage this App build first')
  }
  const object = await env.FILES?.get(objectKey(project, id))
  if (!object) fail(409, 'build_missing', 'The checked build is unavailable')
  const { output } = await object.json<{ output: unknown }>()
  const payload = appOutput.parse(output)
  if (await digest(JSON.stringify(payload)) !== build.digest) fail(409, 'build_changed', 'The checked build has changed')
  return { build, target, payload }
}

export async function previewAppBuild(env: ZugoidEnv, actor: Membership, project: string, id: string) {
  const { target, payload } = await appArtifact(env, actor, project, id)
  return previewGadgetBuild(env, actor, target.app, payload)
}

export async function publishAppBuild(env: ZugoidEnv, actor: Membership, project: string, id: string) {
  await requireProject(env, actor.authorization, project, true)
  const { build, target, payload } = await appArtifact(env, actor, project, id)
  if (!await isProjectRelease(env, project, build)) fail(409, 'build_not_release', 'Build a tag created in Project Versions before publishing')
  if (build.publishedVersion) return getGadgetDetail(env, actor, target.app)
  return publishGadget(env, actor, target.app, build.appRevision!, { id, ...payload })
}
