import { expect, it, vi } from 'vitest'
import { cleanupClosedPreviews, closedPreviewResources, liveRefs } from '../../scripts/preview-cleanup.mjs'

const sha = (n: number) => String(n).padStart(40, '0')
const refs = [
  `${sha(1)}\trefs/heads/main`, `${sha(2)}\trefs/heads/telegram-open-server-directly`, `${sha(3)}\trefs/heads/fix/calls-settings-off-cloudflare`,
  `${sha(2)}\trefs/pull/433/head`, `${sha(9)}\trefs/pull/433/merge`,
  // Open but conflicting: no merge ref, its head is still a live branch.
  `${sha(3)}\trefs/pull/422/head`,
  // Merged and its branch deleted: only the head ref remains.
  `${sha(7)}\trefs/pull/427/head`,
].join('\n')
const live = liveRefs(refs)

it('keeps main, open PRs and everything outside the Preview naming', () => {
  const previews = [{ id: '1', name: 'main' }, { id: '2', name: 'telegram-open-server-directly' }, { id: '3', name: 'claude/factory-section' }, { id: '4', name: 'release/0.3.7' }]
  const databases = ['zugoid', 'zugoid-main', 'zugoid-server-main', 'zugoid-pr-433', 'zugoid-server-pr-433', 'zugoid-server-pr-422-fresh', 'zugoid-pr-427', 'zugoid-server-pr-427', 'zugoid-server-pr-398-fresh',
    'zugoid-f4c27435-3c8a-4186-b82f-89c11e71dcf2-db', 'zugoid-server-staging-files', 'afterprompt-pr-claude-x', 'zugoid-server-pr-abc'].map((name, index) => ({ name, uuid: String(index) }))
  const result = closedPreviewResources({ live, previews, databases })
  expect(result.previews.map(p => p.name)).toEqual(['claude/factory-section', 'release/0.3.7'])
  expect(result.databases.map(d => d.name)).toEqual(['zugoid-server-pr-427', 'zugoid-server-pr-398-fresh'])
})

it('deletes through the account API, pages through lists and keeps going after one failure', async () => {
  const calls: string[] = []
  const page = (prefix: string, count: number) => Array.from({ length: count }, (_, i) => ({ id: `${prefix}${i}`, name: `${prefix}/${i}` }))
  const api = vi.fn(async (path: string, method = 'GET') => {
    calls.push(`${method} ${path}`)
    if (method === 'DELETE') { if (path.endsWith('/old0')) throw new Error('busy'); return null }
    if (path.startsWith('/workers/workers/zugoid-server/previews')) return /[?&]page=1$/.test(path) ? page('old', 100) : [{ id: 'm', name: 'main' }]
    if (path.startsWith('/d1/database')) return [{ name: 'zugoid-server-pr-427', uuid: 'u1' }, { name: 'zugoid-server-pr-433', uuid: 'u2' }]
    throw new Error('unexpected ' + path)
  })
  const deleted = await cleanupClosedPreviews({ api, live, log: () => {} })
  expect(deleted.previews).toHaveLength(99)
  expect(deleted.failed).toEqual(['zugoid-server:old/0: busy'])
  expect(deleted.databases).toEqual(['zugoid-server-pr-427'])
  expect(calls).toContain('DELETE /d1/database/u1')
  expect(calls).not.toContain('DELETE /d1/database/u2')
  expect(calls).not.toContain('DELETE /workers/workers/zugoid-server/previews/m')
})

it('reads live branches and open PRs from Git refs and refuses incomplete refs', () => {
  expect([...live.branches].sort()).toEqual(['fix/calls-settings-off-cloudflare', 'main', 'telegram-open-server-directly'])
  expect([...live.numbers].sort()).toEqual([422, 433])
  expect(() => liveRefs(`${sha(2)}\trefs/heads/feature`)).toThrow('main is missing')
})
