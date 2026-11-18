import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { sha256 } from '../../scripts/release-artifacts.mjs'

const definitions = readFileSync('self-host/install/install.sh', 'utf8').replace(/main "\$@"\n$/, '')
const version = '9.0.0'

function run(script: string, env: Record<string, string> = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'zugoid-vps-host-'))
  const harness = join(directory, 'harness.sh')
  writeFileSync(harness, definitions + '\nset -euo pipefail\n' + script)
  try {
    return execFileSync('bash', [harness], { env: { ...process.env, ...env }, encoding: 'utf8', timeout: 15000 })
  } finally { rmSync(directory, { recursive: true, force: true }) }
}

it('binds loopback HTTP to 127.0.0.1 and public TLS to every interface', () => {
  const directory = mkdtempSync(join(tmpdir(), 'zugoid-bind-'))
  try {
    const stage = join(directory, 'stage')
    mkdirSync(stage)
    const loopback = run(`
dir=${JSON.stringify(directory)}
stage=${JSON.stringify(stage)}
pinned_version=${version}
channel=stable
ZUGOID_DOMAIN=127.0.0.1 ZUGOID_ADMIN_USERNAME=owner ZUGOID_NO_TLS=true ZUGOID_HTTP_PORT=8081 ZUGOID_HTTPS_PORT=8444
configure_new
sed -n "s/^ZUGOID_BIND='\\(.*\\)'/\\1/p" "$stage/.env"
`)
    expect(loopback.trim()).toBe('127.0.0.1')
    const published = run(`
dir=${JSON.stringify(directory)}
stage=${JSON.stringify(stage)}
pinned_version=${version}
channel=stable
ZUGOID_DOMAIN=example.com ZUGOID_ADMIN_USERNAME=owner ZUGOID_NO_TLS=false
configure_new
sed -n "s/^ZUGOID_BIND='\\(.*\\)'/\\1/p" "$stage/.env"
`)
    expect(published.trim()).toBe('0.0.0.0')
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

it.skipIf(process.platform !== 'linux')('creates a missing lock directory and names the failure when it cannot', () => {
  const directory = mkdtempSync(join(tmpdir(), 'zugoid-lock-'))
  const locks = join(directory, 'locks')
  const blocked = join(directory, 'not-a-directory')
  writeFileSync(blocked, 'file')
  try {
    run(`dir=/opt/zugoid\nZUGOID_LOCK_DIR=${JSON.stringify(locks)}\nlock_installation\n`)
    expect(readFileSync(join(locks, 'zugoid-' + execFileSync('bash', ['-c', `printf %s /opt/zugoid | sha256sum | cut -c1-16`], { encoding: 'utf8' }).trim() + '.lock'))).toBeDefined()
    let rejection = ''
    try { run(`dir=/opt/zugoid\nZUGOID_LOCK_DIR=${JSON.stringify(blocked)}\nlock_installation\n`) }
    catch (error) { rejection = String((error as { stderr?: Buffer }).stderr) }
    expect(rejection).toContain('Cannot create the installer lock directory')
    expect(rejection).not.toContain('No such file or directory')
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

it('reports a rerun Factory request and keeps a failed optional Factory from failing the Server install', () => {
  const notice = run(`
dir=/opt/missing
ZUGOID_FACTORY=true
factory_rerun_notice
`)
  expect(notice).toContain('sudo zugoid factory enable --trust-shared-kernel')
  const quiet = run(`
dir=$(mktemp -d)
mkdir -p "$dir/factory"
printf 'ZUGOID_WORKSPACE_IMAGE=sha256:${'a'.repeat(64)}\\n' > "$dir/factory/factory.env"
ZUGOID_FACTORY=true
factory_rerun_notice
`)
  expect(quiet).toBe('')
  const installed = run(`
factory_command() { fail 'No such image: sha256:${'c'.repeat(64)}'; }
ZUGOID_FACTORY=true
pinned_version=${version}
enable_optional_factory
`)
  expect(installed).toContain('Server installed. Optional Factory did not start.')
  expect(installed).toContain('--no-systemd')
})

it('prints progress while Server containers are still starting', () => {
  const output = run(`
compose() { sleep 2; }
compose_up
`, { ZUGOID_COMPOSE_POLL: '1' })
  expect(output).toContain('Waiting for Server containers')
  expect(output).toContain('Still waiting for Server containers')
})

it('fails Factory status and logs before calling systemd when it is not running', () => {
  const directory = mkdtempSync(join(tmpdir(), 'zugoid-no-systemd-'))
  const calls = join(directory, 'calls')
  try {
    const harness = join(directory, 'harness.sh')
    writeFileSync(harness, definitions + `
set -euo pipefail
dir=/opt/zugoid
project=factory-fixture
version=${version}
systemctl() { printf '%s\\n' "$*" >> ${JSON.stringify(calls)}; }
journalctl() { printf '%s\\n' "$*" >> ${JSON.stringify(calls)}; exit 0; }
factory_command status
`)
    const status = execFileSync('bash', [harness], { env: { ...process.env, ZUGOID_SYSTEMD_DIR: join(directory, 'missing') }, encoding: 'utf8', timeout: 10000 })
    expect(status).toContain('never')
  } catch (error) {
    const rejection = String((error as { stderr?: Buffer; stdout?: Buffer }).stderr)
    expect(rejection).toContain('systemd')
    expect(() => readFileSync(calls)).toThrow()
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

function factoryEnable(loadedId: string, pins: { image: string; configDigest?: string; indexDigest?: string }, options: { existing?: string; systemd?: boolean } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'zugoid-factory-load-'))
  const installed = join(directory, 'installed')
  const stage = join(directory, 'stage')
  const assets = join(directory, 'release')
  const source = join(directory, 'source')
  const calls = join(directory, 'calls')
  const units = join(directory, 'units')
  mkdirSync(installed); mkdirSync(stage); mkdirSync(assets); mkdirSync(units); mkdirSync(join(source, 'src'), { recursive: true })
  if (options.existing !== undefined) {
    mkdirSync(join(installed, 'factory/releases/8.0.0'), { recursive: true })
    writeFileSync(join(installed, 'factory/factory.env'), options.existing)
  }
  writeFileSync(join(installed, '.env'), "PUBLIC_ORIGIN='http://127.0.0.1:8081'\n")
  writeFileSync(join(source, 'node'), '#!/bin/sh\nexit 0\n', { mode: 0o755 })
  chmodSync(join(source, 'node'), 0o755)
  writeFileSync(join(source, 'LICENSE'), 'license\n'); writeFileSync(join(source, 'LICENSE.node'), 'license\n')
  writeFileSync(join(source, 'src/daemon.mjs'), 'export {}\n')
  const nodeAsset = 'zugoid-compute-node-linux-amd64.tgz'
  const imageAsset = 'zugoid-workspace-linux-amd64.tar.gz'
  execFileSync('tar', ['-czf', join(assets, nodeAsset), '-C', source, 'node', 'LICENSE', 'LICENSE.node', 'src'])
  writeFileSync(join(assets, imageAsset), 'workspace image fixture')
  const files = Object.fromEntries([nodeAsset, imageAsset].map(file => {
    const bytes = readFileSync(join(assets, file))
    return [file, { sha256: sha256(bytes), size: bytes.length }]
  }))
  writeFileSync(join(assets, 'zugoid-factory.json'), JSON.stringify({ schemaVersion: 1, version, ...pins, files }))
  const harness = join(directory, 'harness.sh')
  writeFileSync(harness, definitions + `
set -euo pipefail
dir=${JSON.stringify(installed)}
stage=${JSON.stringify(stage)}
project=factory-fixture
version=${version}
need() { :; }
uname() { printf 'x86_64\\n'; }
df() { printf 'Avail\\n23456789000\\n'; }
awk() { if [[ $1 == *MemAvailable:* ]]; then printf '4000000\\n'; else command awk "$@"; fi; }
release_metadata() { base=${JSON.stringify(assets)}; }
validate_metadata() { :; }
manifest_hash() { sha256sum ${JSON.stringify(assets)}/$1 | cut -d' ' -f1; }
fetch() { cp -- "$1" "$2"; }
systemctl() { printf 'systemctl %s\\n' "$*" >> ${JSON.stringify(calls)}; }
docker() {
  if [[ $1 == load ]]; then return 0; fi
  if [[ $1 == image && $2 == inspect ]]; then
    case "$*" in
      *'{{.Id}}'*) printf '%s\\n' "$FACTORY_LOADED_ID" ;;
      *'{{.Os}}'*) printf 'linux/amd64\\n' ;;
      *) return 1 ;;
    esac
    return 0
  fi
  printf 'docker %s\\n' "$*" >> ${JSON.stringify(calls)}
}
ZUGOID_SYSTEMD_DIR=${JSON.stringify(units)}
ZUGOID_UNIT_DIR=${JSON.stringify(units)}
factory_command enable --trust-shared-kernel${options.systemd ? '' : ' --no-systemd'}
`)
  return { directory, installed, calls, harness, units }
}

it('accepts the config digest on a classic store and the index id on containerd', () => {
  const index = 'sha256:' + 'c'.repeat(64)
  const config = 'sha256:' + '3'.repeat(64)
  const classic = factoryEnable(config, { image: index, configDigest: config, indexDigest: index })
  try {
    execFileSync('bash', [classic.harness], { env: { ...process.env, FACTORY_LOADED_ID: config }, encoding: 'utf8', timeout: 15000 })
    expect(readFileSync(join(classic.installed, 'factory/factory.env'), 'utf8')).toContain('ZUGOID_WORKSPACE_IMAGE=' + config)
    expect(() => readFileSync(classic.calls, 'utf8')).toThrow()
  } finally { rmSync(classic.directory, { recursive: true, force: true }) }
  const containerd = factoryEnable(index, { image: index, configDigest: config, indexDigest: index })
  try {
    execFileSync('bash', [containerd.harness], { env: { ...process.env, FACTORY_LOADED_ID: index }, encoding: 'utf8', timeout: 15000 })
    expect(readFileSync(join(containerd.installed, 'factory/factory.env'), 'utf8')).toContain('ZUGOID_WORKSPACE_IMAGE=' + index)
  } finally { rmSync(containerd.directory, { recursive: true, force: true }) }
})

it('refuses a loaded image that matches none of the published digests', () => {
  const index = 'sha256:' + 'c'.repeat(64)
  const config = 'sha256:' + '3'.repeat(64)
  const unknown = 'sha256:' + 'e'.repeat(64)
  const fixture = factoryEnable(unknown, { image: index, configDigest: config, indexDigest: index })
  try {
    let rejection = ''
    try { execFileSync('bash', [fixture.harness], { env: { ...process.env, FACTORY_LOADED_ID: unknown }, encoding: 'utf8', timeout: 15000 }) }
    catch (error) { rejection = String((error as { stderr?: Buffer }).stderr) }
    expect(rejection).toContain('does not match a published Factory digest')
    expect(() => readFileSync(join(fixture.installed, 'factory/factory.env'))).toThrow()
  } finally { rmSync(fixture.directory, { recursive: true, force: true }) }
})

it('replaces an installed Node of an earlier release in place instead of refusing its changed image', () => {
  const index = 'sha256:' + 'c'.repeat(64)
  const earlier = 'sha256:' + '1'.repeat(64)
  const existing = `ZUGOID_SERVER_ORIGIN=http://127.0.0.1:8081\nZUGOID_NODE_STATE=/opt/zugoid/factory/state\nZUGOID_WORKSPACE_IMAGE=${earlier}\nZUGOID_SHARED_KERNEL_TRUSTED=1\nZUGOID_NODE_BOXES=2\nZUGOID_EXTRA=$(id)\n`
  const manual = factoryEnable(index, { image: index }, { existing })
  try {
    const output = execFileSync('bash', [manual.harness], { env: { ...process.env, FACTORY_LOADED_ID: index }, encoding: 'utf8', timeout: 15000 })
    const config = readFileSync(join(manual.installed, 'factory/factory.env'), 'utf8')
    expect(config).toContain('ZUGOID_WORKSPACE_IMAGE=' + index)
    expect(config).not.toContain(earlier)
    expect(config).toContain('ZUGOID_NODE_BOXES=2\n')
    expect(config).not.toContain('ZUGOID_EXTRA')
    expect(output).toContain('without systemd')
  } finally { rmSync(manual.directory, { recursive: true, force: true }) }
  const service = factoryEnable(index, { image: index }, { existing, systemd: true })
  try {
    const output = execFileSync('bash', [service.harness], { env: { ...process.env, FACTORY_LOADED_ID: index }, encoding: 'utf8', timeout: 15000 })
    expect(output).toContain('Local Compute Node replaced with ' + version)
    const calls = readFileSync(service.calls, 'utf8')
    expect(calls.indexOf('systemctl stop zugoid-factory-factory-fixture')).toBeLessThan(calls.indexOf('systemctl enable --now zugoid-factory-factory-fixture'))
    expect(calls).toContain('docker image rm ' + earlier)
    const unit = readFileSync(join(service.units, 'zugoid-factory-factory-fixture.service'), 'utf8')
    expect(unit).toContain(`factory/releases/${version}/src/daemon.mjs`)
    expect(unit).toContain(`factory/releases/${version}/src/pair-local.mjs`)
    expect(() => readFileSync(join(service.installed, 'factory/releases/8.0.0'))).toThrow(/ENOENT/)
  } finally { rmSync(service.directory, { recursive: true, force: true }) }
})

it('keeps the same release installed when its image is unchanged, without dropping its own box image', () => {
  const index = 'sha256:' + 'c'.repeat(64)
  const fixture = factoryEnable(index, { image: index }, { existing: `ZUGOID_WORKSPACE_IMAGE=${index}\n`, systemd: true })
  try {
    const output = execFileSync('bash', [fixture.harness], { env: { ...process.env, FACTORY_LOADED_ID: index }, encoding: 'utf8', timeout: 15000 })
    expect(output).toContain('Local Factory installed.')
    expect(readFileSync(fixture.calls, 'utf8')).not.toContain('image rm')
  } finally { rmSync(fixture.directory, { recursive: true, force: true }) }
})

it('replaces the local Node after a Server upgrade only while its service is installed, and never fails the upgrade for it', () => {
  const directory = mkdtempSync(join(tmpdir(), 'zugoid-upgrade-node-'))
  try {
    mkdirSync(join(directory, 'factory')); mkdirSync(join(directory, 'units'))
    writeFileSync(join(directory, 'factory/factory.env'), 'ZUGOID_WORKSPACE_IMAGE=sha256:' + '1'.repeat(64) + '\n')
    const setup = `
dir=${JSON.stringify(directory)}
project=factory-fixture
version=8.0.0
pinned_version=${version}
ZUGOID_UNIT_DIR=${JSON.stringify(join(directory, 'units'))}
`
    const removed = run(setup + `factory_command() { printf 'called %s\\n' "$*"; }\nupgrade_factory\n`)
    expect(removed).not.toContain('called')
    expect(removed).toContain('sudo zugoid compute enable --trust-shared-kernel')
    writeFileSync(join(directory, 'units/zugoid-factory-factory-fixture.service'), '[Unit]\n')
    const replaced = run(setup + `factory_command() { printf 'called %s with %s\\n' "$*" "$version"; }\nupgrade_factory\n`)
    expect(replaced).toContain(`called enable --trust-shared-kernel with ${version}`)
    const failed = run(setup + `factory_command() { fail 'Box image was not loaded.'; }\nupgrade_factory\nprintf 'upgrade continued\\n'\n`)
    expect(failed).toContain('The local Compute Node was not replaced')
    expect(failed).toContain('upgrade continued')
    expect(run(`dir=${JSON.stringify(join(directory, 'missing'))}\nfactory_command() { printf called; }\nupgrade_factory\n`)).toBe('')
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

it('keeps the per-command workspace disks until the operator releases them explicitly', () => {
  const directory = mkdtempSync(join(tmpdir(), 'zugoid-old-disks-'))
  const disks = join(directory, 'factory/state/workspace-disks')
  const ids = ['00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2']
  try {
    mkdirSync(disks, { recursive: true })
    writeFileSync(join(directory, '.env'), "SERVER_ID='00000000-0000-4000-8000-000000000001'\n")
    for (const id of ids) { writeFileSync(join(disks, id + '.img'), 'disk'); mkdirSync(join(disks, id)) }
    writeFileSync(join(disks, 'not-a-disk.img'), 'other')
    const setup = `
dir=${JSON.stringify(directory)}
findmnt() { [[ $3 == *a1 ]]; }
umount() { printf 'umount %s\\n' "$1"; }
docker() { if [[ $2 == inspect ]]; then [[ $3 == *a1 ]] && printf '00000000-0000-4000-8000-000000000001\\n' || printf 'another\\n'; else printf 'docker %s\\n' "$*" >> "$dir/calls"; fi; }
`
    const listed = run(setup + 'old_disks_notice\nrelease_old_disks\n')
    expect(listed).toContain('2 workspace disks of the per-command Factory')
    expect(listed).toContain('Nothing was deleted')
    expect(readFileSync(join(disks, ids[0] + '.img'), 'utf8')).toBe('disk')
    const released = run(setup + 'release_old_disks --yes\n')
    expect(released).toContain('umount ' + join(disks, ids[0]))
    expect(readFileSync(join(directory, 'calls'), 'utf8')).toBe(`docker volume rm zugoid-ws-${ids[0]}\n`)
    expect(released).toContain('Released 2 workspace disks')
    for (const id of ids) expect(() => readFileSync(join(disks, id + '.img'))).toThrow(/ENOENT/)
    expect(readFileSync(join(disks, 'not-a-disk.img'), 'utf8')).toBe('other')
    expect(run(setup + 'release_old_disks --yes\n')).toContain('No workspace disks of the per-command Factory remain.')
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
