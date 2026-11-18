import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { expect, it } from 'vitest'
import { sha256, validateReleaseManifest } from '../../scripts/release-artifacts.mjs'
import { encodeFactoryLayer, validateFactoryImage } from '../../scripts/factory-image-layers.mjs'

const factoryAssets = ['zugoid-factory.json', 'zugoid-compute-node-linux-amd64.tgz', 'zugoid-workspace-linux-amd64.tar.gz', 'zugoid-workspace-config.json', 'zugoid-workspace-manifest.json']
const version = '9.0.0', commit = 'a'.repeat(40)
function release() {
  const files = Object.fromEntries([
    'zugoid-deployment.json', 'zugoid-cloudflare-manifest.json', 'zugoid-runtime-linux-amd64.tar.gz',
    'zugoid-docs.tgz', 'zugoid-worker.mjs', 'zugoid-assets.json', `zugoid-deployment-core-${version}.tgz`, ...factoryAssets,
  ].map(file => [file, { sha256: 'b'.repeat(64), size: 10 }]))
  return { schemaVersion: 3, version, commit, releasePr: 1, components: ['server', 'docs'], factoryInstaller: 1, files }
}

it('requires the full optional Factory payload while preserving immutable releases without Factory', () => {
  expect(() => validateReleaseManifest(release(), 'v' + version, commit)).not.toThrow()
  for (const file of factoryAssets) {
    const missing = release()
    Reflect.deleteProperty(missing.files, file)
    expect(() => validateReleaseManifest(missing, 'v' + version, commit)).toThrow('Incomplete Factory release')
    const tampered = release()
    tampered.files[file]!.sha256 = 'not-a-checksum'
    expect(() => validateReleaseManifest(tampered, 'v' + version, commit)).toThrow('Incomplete Factory release')
  }
  const legacy = release()
  Reflect.deleteProperty(legacy, 'factoryInstaller')
  for (const file of factoryAssets) Reflect.deleteProperty(legacy.files, file)
  expect(() => validateReleaseManifest(legacy, 'v' + version, commit)).not.toThrow()
})
it.each([Number.NaN, Number.POSITIVE_INFINITY, 1.5, '1'])('rejects invalid Factory asset byte counts: %s', size => {
  const manifest = release()
  manifest.files['zugoid-factory.json']!.size = size as number
  expect(() => validateReleaseManifest(manifest, 'v' + version, commit)).toThrow('Incomplete Factory release')
})
it.each(['tar', 'gzip'])('builds a portable Node payload and valid OCI layers from %s Docker exports', format => {
  const directory = mkdtempSync(join(tmpdir(), 'zugoid-factory-release-'))
  const script = resolve('scripts/build-factory-release.mjs'), bin = join(directory, 'bin'), dockerArchive = join(directory, 'docker-save')
  const source = join(directory, 'packages/compute-node/src')
  try {
    mkdirSync(bin); mkdirSync(dockerArchive); mkdirSync(source, { recursive: true })
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ version }))
    const daemonSource = 'export const releaseFixture = true\n'
    writeFileSync(join(source, 'daemon.mjs'), daemonSource)
    writeFileSync(join(source, 'state-store.mjs'), 'export const journalFixture = true\n')
    const layers = ['base', 'tools'].map(name => {
      const content = join(directory, name)
      mkdirSync(content); writeFileSync(join(content, name + '.txt'), name + ' layer content\n')
      const target = join(dockerArchive, name + '.tar')
      execFileSync('tar', ['-cf', target, '-C', content, '.'])
      const bytes = readFileSync(target)
      // Classic Docker saves tar layers; containerd saves compressed blobs.
      // The filename does not determine the exported compression format.
      if (format === 'gzip') writeFileSync(target, gzipSync(bytes))
      return { name: name + '.tar', bytes }
    })
    const config = Buffer.from(JSON.stringify({ architecture: 'amd64', os: 'linux', rootfs: { type: 'layers', diff_ids: layers.map(layer => 'sha256:' + sha256(layer.bytes)) } }))
    const imageId = 'sha256:' + sha256(config)
    writeFileSync(join(dockerArchive, 'config.json'), config)
    writeFileSync(join(dockerArchive, 'manifest.json'), JSON.stringify([{ Config: 'config.json', RepoTags: [`zugoid-workspace:${version}`], Layers: layers.map(layer => layer.name) }]))
    // The production build script still creates all tar/gzip/OCI assets. Only its
    // trusted Docker boundary is deterministic; no registry or cloud calls occur.
    writeFileSync(join(bin, 'docker'), `#!${process.execPath}\nconst {execFileSync}=require('node:child_process');const args=process.argv.slice(2);if(args[0]==='build')process.exit(0);if(args[0]==='run'&&args[args.indexOf('--network')+1]==='none')process.exit(0);if(args[0]==='image'&&args[1]==='inspect'){process.stdout.write(${JSON.stringify(imageId)});process.exit(0)}if(args[0]==='save'){execFileSync('tar',['-cf',args[args.indexOf('-o')+1],'-C',${JSON.stringify(dockerArchive)},'.']);process.exit(0)}process.exit(1)\n`, { mode: 0o755 })
    execFileSync(process.execPath, [script], { cwd: directory, env: { ...process.env, PATH: bin + ':' + process.env.PATH }, timeout: 30000, stdio: 'pipe' })
    const output = join(directory, '.installer/factory')
    const manifest = JSON.parse(readFileSync(join(output, 'zugoid-factory.json'), 'utf8'))
    expect(manifest).toMatchObject({ schemaVersion: 1, version, image: imageId, configDigest: imageId })
    expect(manifest.indexDigest).toBeUndefined()
    for (const [file, metadata] of Object.entries(manifest.files) as Array<[string, { sha256: string; size: number }]>) {
      const bytes = readFileSync(join(output, file))
      expect(metadata).toEqual({ sha256: sha256(bytes), size: bytes.length })
    }
    expect(Object.keys(manifest.files)).toEqual(expect.arrayContaining(factoryAssets.filter(file => file !== 'zugoid-factory.json')))
    const ociBytes = readFileSync(join(output, 'zugoid-workspace-manifest.json'))
    expect(manifest.manifestDigest).toBe('sha256:' + sha256(ociBytes))
    const oci = JSON.parse(ociBytes.toString())
    expect(oci).toMatchObject({ schemaVersion: 2, config: { digest: imageId, size: config.length }, layers: expect.any(Array) })
    expect(readFileSync(join(output, 'zugoid-workspace-config.json'))).toEqual(config)
    expect(oci.layers).toHaveLength(layers.length)
    for (const [index, descriptor] of oci.layers.entries()) {
      const entry = manifest.layers[index], compressed = readFileSync(join(output, entry.file))
      expect(entry).toMatchObject(descriptor)
      expect(descriptor.digest).toBe('sha256:' + sha256(compressed))
      expect(descriptor.size).toBe(compressed.length)
      expect(sha256(gunzipSync(compressed))).toBe(sha256(layers[index]!.bytes))
      if (format === 'gzip') expect(compressed).toEqual(readFileSync(join(dockerArchive, layers[index]!.name)))
    }
    expect(() => validateFactoryImage(output)).not.toThrow()
    expect(() => encodeFactoryLayer(layers[0]!.bytes, 'sha256:' + '0'.repeat(64))).toThrow('diff_id mismatch')
    // Even matching outer checksums cannot make a double-gzipped layer valid.
    const first = manifest.layers[0], nested = gzipSync(readFileSync(join(output, first.file)))
    writeFileSync(join(output, first.file), nested)
    first.digest = 'sha256:' + sha256(nested); first.size = nested.length
    oci.layers[0] = { mediaType: first.mediaType, digest: first.digest, size: first.size }
    const nestedManifest = Buffer.from(JSON.stringify(oci))
    writeFileSync(join(output, 'zugoid-workspace-manifest.json'), nestedManifest)
    manifest.manifestDigest = 'sha256:' + sha256(nestedManifest)
    manifest.files[first.file] = { sha256: sha256(nested), size: nested.length }
    manifest.files['zugoid-workspace-manifest.json'] = { sha256: sha256(nestedManifest), size: nestedManifest.length }
    writeFileSync(join(output, 'zugoid-factory.json'), JSON.stringify(manifest))
    expect(() => validateFactoryImage(output)).toThrow('double-gzipped')
    const nodeArchive = join(output, 'zugoid-compute-node-linux-amd64.tgz')
    expect(execFileSync('tar', ['-xOf', nodeArchive, 'src/daemon.mjs'], { encoding: 'utf8' })).toBe(daemonSource)
    const extracted = join(directory, 'portable-node')
    mkdirSync(extracted)
    execFileSync('tar', ['-xzf', nodeArchive, '-C', extracted])
    expect(execFileSync(join(extracted, 'node'), ['--version'], { encoding: 'utf8' }).trim()).toBe(process.version)
    const saved = join(directory, 'saved-again')
    mkdirSync(saved)
    execFileSync('tar', ['-xzf', join(output, 'zugoid-workspace-linux-amd64.tar.gz'), '-C', saved])
    expect(JSON.parse(readFileSync(join(saved, 'manifest.json'), 'utf8'))[0].Layers).toEqual(layers.map(layer => layer.name))
  } finally { rmSync(directory, { recursive: true, force: true }) }
}, 45000)
it('replaces a changed released image only after it verifies, keeping the running service, its Node journal and Task disks until then', () => {
  const directory = mkdtempSync(join(tmpdir(), 'zugoid-factory-pin-'))
  const installed = join(directory, 'installed'), stage = join(directory, 'stage'), assets = join(directory, 'release'), source = join(directory, 'source')
  try {
    for (const folder of [installed, stage, assets, source]) mkdirSync(folder)
    mkdirSync(join(installed, 'factory/state'), { recursive: true }); mkdirSync(join(source, 'src'))
    const privateEnv = 'ZUGOID_WORKSPACE_IMAGE=sha256:' + 'c'.repeat(64) + '\n'
    writeFileSync(join(installed, 'factory/factory.env'), privateEnv)
    writeFileSync(join(installed, 'factory/state/node-state.sqlite'), 'retained private journal fixture')
    writeFileSync(join(installed, 'factory/state/task.img'), 'retained Task disk fixture')
    writeFileSync(join(source, 'node'), 'unused Node payload fixture')
    writeFileSync(join(source, 'src/daemon.mjs'), 'unused daemon payload fixture')
    const nodeAsset = 'zugoid-compute-node-linux-amd64.tgz', imageAsset = 'zugoid-workspace-linux-amd64.tar.gz'
    execFileSync('tar', ['-czf', join(assets, nodeAsset), '-C', source, 'node', 'src'])
    writeFileSync(join(assets, imageAsset), 'unused image payload fixture')
    const files = Object.fromEntries([nodeAsset, imageAsset].map(file => [file, { sha256: sha256(readFileSync(join(assets, file))), size: readFileSync(join(assets, file)).length }]))
    writeFileSync(join(assets, 'zugoid-factory.json'), JSON.stringify({ schemaVersion: 1, version, image: 'sha256:' + 'd'.repeat(64), files }))
    const definitions = readFileSync('self-host/install/install.sh', 'utf8').replace(/main "\$@"\n$/, '')
    const harness = join(directory, 'factory-command.sh')
    writeFileSync(harness, definitions + `
set -euo pipefail
dir="$FACTORY_TEST_INSTALLED"
stage="$FACTORY_TEST_STAGE"
project=factory-fixture
version=9.0.0
need() { :; }
uname() { printf 'x86_64\\n'; }
df() { printf 'Avail\\n23456789000\\n'; }
awk() { if [[ $1 == *MemAvailable:* ]]; then printf '4000000\\n'; else command awk "$@"; fi; }
release_metadata() { base="$FACTORY_TEST_ASSETS"; }
validate_metadata() { :; }
manifest_hash() { sha256sum "$FACTORY_TEST_ASSETS/$1" | cut -d' ' -f1; }
fetch() { cp -- "$1" "$2"; }
systemctl() { printf '%s\\n' "$*" >> "$FACTORY_TEST_CALLS"; }
docker() { printf '%s\\n' "$*" >> "$FACTORY_TEST_CALLS"; }
ZUGOID_SYSTEMD_DIR="$FACTORY_TEST_STAGE"
factory_command enable --trust-shared-kernel
`)
    let rejection = ''
    try {
      execFileSync('bash', [harness], { env: { ...process.env, FACTORY_TEST_INSTALLED: installed, FACTORY_TEST_STAGE: stage, FACTORY_TEST_ASSETS: assets, FACTORY_TEST_CALLS: join(directory, 'host-calls') }, timeout: 10000, stdio: 'pipe' })
    } catch (error) {
      rejection = String((error as { stderr?: Buffer }).stderr)
    }
    // The stand-in Docker loads nothing, so the new image never verifies.
    expect(rejection).toContain('does not match a published Factory digest')
    expect(readFileSync(join(installed, 'factory/factory.env'), 'utf8')).toBe(privateEnv)
    expect(readFileSync(join(installed, 'factory/state/node-state.sqlite'), 'utf8')).toBe('retained private journal fixture')
    expect(readFileSync(join(installed, 'factory/state/task.img'), 'utf8')).toBe('retained Task disk fixture')
    expect(readFileSync(join(directory, 'host-calls'), 'utf8')).not.toContain('stop')
  } finally { rmSync(directory, { recursive: true, force: true }) }
}, 15000)
