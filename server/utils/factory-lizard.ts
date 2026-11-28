import { z } from 'zod'
import type { ZugoidEnv } from '../../workers/env'
import { fail } from './cf'
import type { ArtifactsGrant } from './factory-artifacts'

const ticket = z.object({ sandboxId: z.string().regex(/^[a-zA-Z0-9_-]+$/) })
const outcome = z.object({ exitCode: z.number(), stdout: z.string().default(''), stderr: z.string().default('') })
const root = 'https://lizard.build/api/sandboxes'
export const BUILD_LIMIT = 6 * 1024 * 1024
export const BUILD_LIFETIME = 16 * 60 * 1000

async function request(env: ZugoidEnv, path: string, method: string, body?: object) {
  if (!env.FACTORY_LIZARD_KEY) fail(409, 'build_runner_missing', 'Connect a Lizard project first')
  return fetch(root + path, {
    method, redirect: 'manual',
    headers: { Authorization: 'Bearer ' + env.FACTORY_LIZARD_KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(35_000),
  })
}

export async function startSandbox(env: ZugoidEnv) {
  if (!env.FACTORY_LIZARD_PROJECT) fail(409, 'build_runner_missing', 'Connect a Lizard project first')
  const r = await request(env, '', 'POST', { template: 'desktop', size: 'small', projectId: env.FACTORY_LIZARD_PROJECT,
    timeoutMs: BUILD_LIFETIME, metadata: { purpose: 'zugoid-factory-build' } })
  if (!r.ok) fail(502, 'build_runner_failed', 'Lizard could not start the build sandbox')
  return ticket.parse(await r.json()).sandboxId
}

async function exec(env: ZugoidEnv, id: string, cmd: string[], envs?: Record<string, string>) {
  const r = await request(env, '/' + encodeURIComponent(id) + '/exec', 'POST', { cmd, envs, timeoutMs: 30_000 })
  if (!r.ok) fail(502, 'build_runner_failed', 'Lizard could not run the build command')
  return outcome.parse(await r.json())
}

export async function checkout(env: ZugoidEnv, sandbox: string, grant: ArtifactsGrant, ref: string, sha: string) {
  const result = await exec(env, sandbox, ['sh', '-ec', [
    'mkdir /tmp/factory && cd /tmp/factory && git init -q',
    'git -c "http.extraHeader=Authorization: Bearer $FACTORY_SOURCE_TOKEN" fetch -q --depth=1 "$FACTORY_REMOTE" "$FACTORY_REF"',
    'if [ "$(git rev-parse "FETCH_HEAD^{commit}")" != "$FACTORY_SHA" ]; then git -c "http.extraHeader=Authorization: Bearer $FACTORY_SOURCE_TOKEN" fetch -q --depth=1 "$FACTORY_REMOTE" "$FACTORY_SHA"; fi',
    'test "$(git rev-parse "FETCH_HEAD^{commit}")" = "$FACTORY_SHA"',
    'git checkout --detach -q "$FACTORY_SHA"',
  ].join('\n')], { FACTORY_SOURCE_TOKEN: grant.token, FACTORY_REMOTE: grant.remote, FACTORY_REF: ref, FACTORY_SHA: sha })
  if (result.exitCode !== 0) fail(409, 'build_checkout_failed', 'Could not check out the selected commit')
}

export async function launchBuild(env: ZugoidEnv, sandbox: string) {
  const r = await exec(env, sandbox, ['sh', '-ec', [
    'cd /tmp/factory',
    'test -f factory.sh',
    'nohup sh -c \'sh factory.sh; code=$?; echo "$code" > /tmp/factory-exit.tmp; mv /tmp/factory-exit.tmp /tmp/factory-exit\' > /tmp/factory-log 2>&1 < /dev/null &',
  ].join('\n')])
  if (r.exitCode !== 0) fail(422, 'build_script_missing', 'The repository must contain factory.sh')
}

export async function readSandboxFile(env: ZugoidEnv, sandbox: string, path: string, maxBytes: number) {
  const r = await request(env, '/' + encodeURIComponent(sandbox) + '/files?' + new URLSearchParams({ path }), 'GET')
  if (r.status === 404) return null
  if (!r.ok || !r.body) fail(502, 'build_runner_failed', 'Lizard could not read a build result')
  const reader = r.body.getReader()
  const decoder = new TextDecoder()
  let content = '', bytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) return content + decoder.decode()
      bytes += value.byteLength
      if (bytes > maxBytes) fail(413, 'build_output_large', 'The build output is too large')
      content += decoder.decode(value, { stream: true })
    }
  } finally { await reader.cancel().catch(() => {}) }
}

export async function buildLog(env: ZugoidEnv, sandbox: string) {
  const r = await exec(env, sandbox, ['tail', '-c', '6000', '/tmp/factory-log'])
  return r.exitCode === 0 ? r.stdout : ''
}

export async function stopSandbox(env: ZugoidEnv, sandbox: string) {
  await request(env, '/' + encodeURIComponent(sandbox), 'DELETE').catch(() => undefined)
}
