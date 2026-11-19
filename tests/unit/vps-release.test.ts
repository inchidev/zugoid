import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { it, expect } from 'vitest'
import { buildVpsRelease } from '../../scripts/build-vps-release.mjs'
import { sha256 } from '../../scripts/release-artifacts.mjs'

it('pins the exact shared Compose, runtime bytes and commit into a complete Bash script', async () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'zugoid-vps-release-'))
  try {
    const runtime = resolve(directory, 'runtime.gz')
    writeFileSync(runtime, 'runtime bytes')
    await buildVpsRelease({ directory, runtime, version: '0.2.0-alpha.7', commit: 'a'.repeat(40) })
    const script = readFileSync(resolve(directory, 'install.sh'), 'utf8')
    expect(script).not.toContain('@@')
    expect(script).toContain(`runtime_sha='${sha256('runtime bytes')}'`)
    expect(script).toContain(`pinned_commit='${'a'.repeat(40)}'`)
    expect(script).toContain(sha256(readFileSync('self-host/docker-compose.yml')))
    expect(readFileSync(resolve(directory, 'zugoid-compose.yml'))).toEqual(readFileSync('self-host/docker-compose.yml'))
    expect(readFileSync(resolve(directory, 'zugoid'), 'utf8')).toBe(script)
    expect(script.trimEnd().split('\n').at(-1)).toBe('main "$@"')
    execFileSync('bash', ['-n', resolve(directory, 'install.sh')])
    const truncated = resolve(directory, 'truncated.sh')
    writeFileSync(truncated, script.replace(/main "\$@"\n$/, ''))
    expect(spawnSync('bash', [truncated]).status).toBe(0)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

it('orders full SemVer identifiers in the operator CLI before downloading upgrades', () => {
  const source = readFileSync('self-host/install/install.sh', 'utf8').replace(/main "\$@"\n$/, '')
  const cases = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.2', '1.0.0-alpha.10', '1.0.0-beta', '1.0.0-rc.1', '1.0.0', '1.1.0']
  for (let index = 1; index < cases.length; index++) {
    const previous = cases[index - 1]!, next = cases[index]!
    expect(spawnSync('bash', ['-c', source + `\nversion_newer '${next}' '${previous}'`]).status).toBe(0)
    expect(spawnSync('bash', ['-c', source + `\nversion_newer '${previous}' '${next}'`]).status).toBe(1)
  }
  for (const invalid of ['01.0.0', '1.0.0-alpha.01', '1.0.0+build']) expect(spawnSync('bash', ['-c', source + `\nversion_newer '${invalid}' '0.0.0'`]).status).not.toBe(0)
})

it('refuses an upgrade zugoid.com does not offer this Server, says why, and holds nothing back when it cannot ask', () => {
  const source = readFileSync('self-host/install/install.sh', 'utf8').replace(/main "\$@"\n$/, '')
  const directory = mkdtempSync(join(tmpdir(), 'zugoid-coverage-'))
  writeFileSync(join(directory, '.env'), "SERVER_ID='6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b'\nPUBLIC_ORIGIN='https://team.example.com'\n")
  const run = (answer: string | null) => spawnSync('bash', ['-c', `${source}\ndir='${directory}'\ncoverage_answer() { ${answer === null ? 'return 7' : `printf '%s' '${answer}'`}; }\nrequire_coverage && echo continued`], { encoding: 'utf8' })
  const refused = run(JSON.stringify({ covered: false, message: 'No release for this Server.', subscribeUrl: 'https://zugoid.com/billing/checkout?server=6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b' }))
  expect(refused.status).toBe(1)
  expect(refused.stderr).toContain('No release for this Server.')
  expect(refused.stderr).toContain('origin=https%3A%2F%2Fteam.example.com')
  expect(run(JSON.stringify({ covered: true, reason: 'free' })).stdout).toContain('continued')
  const offline = run(null)
  expect(offline.stdout).toContain('Could not ask zugoid.com')
  expect(offline.stdout).toContain('continued')
  expect(run('not json').stdout).toContain('continued')
})

it('asks zugoid.ru only for a Server bought there, and no other site', () => {
  const source = readFileSync('self-host/install/install.sh', 'utf8').replace(/main "\$@"\n$/, '')
  const directory = mkdtempSync(join(tmpdir(), 'zugoid-site-'))
  try {
    const site = (value: string) => {
      writeFileSync(join(directory, '.env'), `ZUGOID_SITE='${value}'\n`)
      return spawnSync('bash', ['-c', `${source}\ndir='${directory}'\ncoverage_site`], { encoding: 'utf8' }).stdout
    }
    expect(site('https://zugoid.ru')).toBe('https://zugoid.ru')
    expect(site('https://evil.example')).toBe('https://zugoid.com')
    expect(site('')).toBe('https://zugoid.com')
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

it('runs the update the Owner requested in Settings and reports how it went', () => {
  const source = readFileSync('self-host/install/install.sh', 'utf8').replace(/main "\$@"\n$/, '')
  const directory = mkdtempSync(join(tmpdir(), 'zugoid-host-update-'))
  try {
    const id = '22222222-2222-4222-8222-222222222222'
    const run = (poll: string, upgrade: string) => spawnSync('bash', ['-c', `${source}
stage='${directory}' channel=stable
host_call() { if [[ $1 == *poll* ]]; then printf '%s' '${poll}'; else printf 'REPORT %s\\n' "$1" >> '${directory}/reports'; fi; }
upgrade_server() { printf 'zugoid: upgrading to %s for %s on %s\\n' "$1" "$ZUGOID_HOST_UPDATE_ID" "$channel"; ${upgrade}; }
rm -f '${directory}/reports'; host_update; cat '${directory}/reports' 2>/dev/null`], { encoding: 'utf8' })
    const done = run(JSON.stringify({ job: { id, targetVersion: '0.3.1' } }), 'return 0')
    expect(done.stdout).toContain(`upgrading to 0.3.1 for ${id} on stable`)
    expect(done.stdout).toMatch(/REPORT .*"stage":"backing_up"/)
    expect(done.stdout).toMatch(/REPORT .*"stage":"complete"/)
    const failed = run(JSON.stringify({ job: { id, targetVersion: '0.4.0-rc.1' } }), "fail 'Checksum mismatch: install.sh'")
    expect(failed.stdout).toContain('on prerelease')
    expect(failed.stdout).toMatch(/REPORT .*"stage":"failed","error":"Checksum mismatch: install.sh"/)
    // Nothing requested, or something that is not a release, runs nothing.
    for (const poll of [JSON.stringify({ job: null }), JSON.stringify({ job: { id, targetVersion: '0.3.1; rm -rf /' } })]) {
      const idle = run(poll, 'return 0')
      expect(idle.stdout).not.toContain('upgrading')
      expect(idle.stdout).not.toContain('REPORT')
    }
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
