import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { appendWorkerScript, BUNDLED_WORKER_MODULE, loadZugoidRelease, parseWorkerModules, workerMainModule } from '../../../packages/deployment-core/src/index'
import { MODULE_NAME } from '../../../packages/deployment-core/src/worker-script'

const encoder = new TextEncoder()
const digest = async (value: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', value))]
  .map(byte => byte.toString(16).padStart(2, '0'))
  .join('')
const modules = { main: 'index.mjs', modules: [{ name: 'index.mjs', content: 'export { default } from "./chunks/nitro/nitro.mjs"' }, { name: 'chunks/nitro/nitro.mjs', content: 'export default {}' }] }

async function release(extra: (asset: (bytes: Uint8Array, url: string) => Promise<object>) => Promise<object>) {
  const worker = encoder.encode('bundled worker')
  const assets = encoder.encode(JSON.stringify({ assets: [], migrations: [] }))
  const files = new Map<string, Uint8Array>([['/zugoid-worker.mjs', worker], ['/zugoid-assets.json', assets]])
  const asset = async (bytes: Uint8Array, url: string) => { files.set(url.slice(1), bytes); return { url: `.${url.slice(1)}`, sha256: await digest(bytes), size: bytes.byteLength } }
  const manifestUrl = 'https://example.com/zugoid-cloudflare-manifest.json'
  const manifest = {
    schemaVersion: 1, version: '0.2.0', releasedAt: '2026-11-18T00:00:00.000Z', compatibilityDate: '2026-09-28', compatibilityFlags: ['nodejs_compat'],
    capabilities: ['zugoid-server-schema-v1'], durableObjects: [],
    worker: await asset(worker, '//zugoid-worker.mjs'), assets: await asset(assets, '//zugoid-assets.json'),
    ...await extra(asset),
  }
  const fetcher = async (input: string | URL | Request) => {
    const url = String(input)
    if (url === manifestUrl) return Response.json(manifest)
    const file = files.get(new URL(url).pathname)
    return file ? new Response(file) : new Response(null, { status: 404 })
  }
  return loadZugoidRelease(manifestUrl, fetcher as typeof fetch)
}

describe('Worker modules in a release', () => {
  it('loads the modules a release ships beside its bundled Worker', async () => {
    const loaded = await release(async asset => ({ workerModules: { ...await asset(encoder.encode(JSON.stringify(modules)), '//zugoid-worker-modules.json'), main: 'index.mjs' } }))
    expect(loaded.modules).toEqual(modules)
    expect(workerMainModule(loaded)).toBe('index.mjs')
  })

  it('keeps the bundled Worker for a release made before modules', async () => {
    const loaded = await release(async () => ({}))
    expect(loaded.modules).toBeUndefined()
    expect(workerMainModule(loaded)).toBe(BUNDLED_WORKER_MODULE)
  })

  it('refuses modules whose bytes do not match the manifest', async () => {
    await expect(release(async asset => {
      const listed = await asset(encoder.encode(JSON.stringify(modules)), '//zugoid-worker-modules.json')
      return { workerModules: { ...listed, sha256: '0'.repeat(64), main: 'index.mjs' } }
    })).rejects.toThrow('integrity')
  })

  it('refuses module names that climb out, repeat, or lack the main module', () => {
    for (const bad of [
      { main: 'index.mjs', modules: [{ name: '../index.mjs', content: '' }] },
      { main: 'index.mjs', modules: [{ name: 'index.mjs', content: '' }, { name: 'index.mjs', content: '' }] },
      { main: 'index.mjs', modules: [{ name: 'other.mjs', content: '' }] },
      { main: 'index.mjs', modules: [{ name: '/etc/index.mjs', content: '' }] },
      { main: 'index.mjs', modules: [{ name: 'index.mjs', content: '' }, { name: 'chunks/../index.mjs', content: '' }] },
      { main: 'index.mjs', modules: [{ name: 'index.mjs', content: '' }, { name: './chunks/a.mjs', content: '' }] },
    ]) expect(() => parseWorkerModules(bad)).toThrow()
  })

  // Nitro puts the routes of /.well-known under a dot segment; 0.2.0 and 0.2.1 shipped such names and the installer refused them.
  it('accepts the dot segments Nitro writes, such as .well-known', () => {
    const names = ['index.mjs', 'chunks/routes/.well-known/zugoid.get.mjs', 'chunks/routes/.well-known/oauth-protected-resource/mcp.mjs', 'chunks/routes/api/_...missing_.mjs']
    expect(parseWorkerModules({ main: 'index.mjs', modules: names.map(name => ({ name, content: '' })) }).modules).toHaveLength(4)
  })

  it('is the same rule the release build checks', () => {
    expect(readFileSync('scripts/build-installer-release.mjs', 'utf8')).toContain(`const MODULE_NAME = ${MODULE_NAME}`)
  })
})

describe('the Worker upload', () => {
  it('sends each module under its own name, or the one bundled script', async () => {
    const withModules = new FormData()
    appendWorkerScript(withModules, { worker: new ArrayBuffer(0), modules })
    expect([...withModules.keys()]).toEqual(['index.mjs', 'chunks/nitro/nitro.mjs'])
    expect((withModules.get('chunks/nitro/nitro.mjs') as File).type).toBe('application/javascript+module')

    const bundled = new FormData()
    appendWorkerScript(bundled, { worker: encoder.encode('w').buffer as ArrayBuffer })
    expect([...bundled.keys()]).toEqual([BUNDLED_WORKER_MODULE])
  })
})
