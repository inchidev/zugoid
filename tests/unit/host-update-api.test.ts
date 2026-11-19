// The VPS host's updater asks POST /api/host/update (server/api/host/update.post.ts): only with the host token, it
// learns the update the Owner requested and reports it along; Settings offers updates only while it answers.
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

const TOKEN = 'h'.repeat(64)
const context = vi.hoisted(() => ({ body: {} as unknown, authorization: '' as string | undefined, database: null as unknown as DatabaseSync, env: {} as Record<string, unknown> }))
vi.mock('../../server/utils/messages', () => ({ writeAudit: vi.fn(async () => {}) }))
vi.mock('../../server/utils/cf', () => ({
  fail: (statusCode: number, code: string, message: string) => { throw Object.assign(Error(message), { statusCode, code }) },
  cf: () => ({ env: context.env }),
}))
vi.mock('../../shared/server-id', () => ({ getServerId: async () => '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b' }))

function d1(database: DatabaseSync) {
  const statement = (sql: string, params: unknown[] = []) => ({
    bind: (...next: unknown[]) => statement(sql, next),
    all: async () => ({ results: database.prepare(sql).all(...params as never[]) }),
    first: async () => database.prepare(sql).get(...params as never[]) ?? null,
    run: async () => { database.prepare(sql).run(...params as never[]); return { meta: { changes: 1 } } },
  })
  return { prepare: (sql: string) => statement(sql) }
}

beforeEach(() => {
  context.database = new DatabaseSync(':memory:')
  context.database.exec('CREATE TABLE server_update_control(id INTEGER PRIMARY KEY, revision INTEGER, payload TEXT); CREATE TABLE server_settings(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT)')
  context.env = { DB: d1(context.database), ZUGOID_RUNTIME: 'celld', ZUGOID_HOST_TOKEN: TOKEN, ZUGOID_VERSION: '0.3.0' }
  context.authorization = `Bearer ${TOKEN}`
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('setHeader', () => {})
  vi.stubGlobal('getHeader', () => context.authorization)
  vi.stubGlobal('readBody', async () => context.body)
})
afterEach(() => { vi.unstubAllGlobals(); context.database.close() })

const call = async (body: unknown) => { context.body = body; return (await import('../../server/api/host/update.post')).default({} as H3Event) }
const job = (stage: string) => JSON.stringify({ schemaVersion: 1, hook: null, backupToken: 'b'.repeat(64), backupBusy: false, job: { id: '22222222-2222-4222-8222-222222222222', serverId: 's', requestedBy: 'owner', sourceVersion: '0.3.0', targetVersion: '0.3.1', stage, buildId: null, createdAt: '', updatedAt: '', backup: null, error: null } })

it('answers only the host that holds the token', async () => {
  context.authorization = undefined
  await expect(call({ action: 'poll' })).rejects.toMatchObject({ statusCode: 403 })
  context.authorization = `Bearer ${'x'.repeat(64)}`
  await expect(call({ action: 'poll' })).rejects.toMatchObject({ statusCode: 403 })
  context.authorization = `Bearer ${TOKEN}`
  context.env.ZUGOID_RUNTIME = 'cloudflare'
  await expect(call({ action: 'poll' })).rejects.toMatchObject({ statusCode: 403 })
})

it('hands the host the queued update, notes that it asked, and moves the update along', async () => {
  const { hostUpdaterAlive } = await import('../../server/utils/host-updates')
  expect(await hostUpdaterAlive(context.env as never)).toBe(false)
  expect(await call({ action: 'poll' })).toMatchObject({ job: null })
  expect(await hostUpdaterAlive(context.env as never)).toBe(true)

  context.database.prepare('INSERT INTO server_update_control VALUES (1, 1, ?)').run(job('queued'))
  expect(await call({ action: 'poll' })).toMatchObject({ job: { id: '22222222-2222-4222-8222-222222222222', targetVersion: '0.3.1' } })
  await call({ action: 'report', id: '22222222-2222-4222-8222-222222222222', stage: 'backing_up' })
  // A running update is not handed out again.
  expect(await call({ action: 'poll' })).toMatchObject({ job: null })
  await call({ action: 'report', id: '22222222-2222-4222-8222-222222222222', stage: 'failed', error: 'Checksum mismatch: install.sh' })
  const stored = JSON.parse((context.database.prepare('SELECT payload FROM server_update_control').get() as { payload: string }).payload)
  expect(stored.job).toMatchObject({ stage: 'failed', error: 'Checksum mismatch: install.sh' })
  expect(stored.backupToken).toBeNull()
  await expect(call({ action: 'report', id: '22222222-2222-4222-8222-222222222222', stage: 'complete' })).rejects.toMatchObject({ statusCode: 409 })
  await expect(call({ action: 'report', id: 'nope', stage: 'complete' })).rejects.toMatchObject({ statusCode: 400 })
})
