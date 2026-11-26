import { afterEach, expect, it, vi } from 'vitest'
import { mcpFixture, ids } from '../helpers/outbound-mcp'
import { executeRunTool } from '../../server/utils/agent-tools'
import { findSchedule, scheduleAuthorization } from '../../server/utils/schedule-service'
import { hasPermission, Permission } from '../../shared/permissions'
import type { ZugoidEnv } from '../../workers/env'

const state = vi.hoisted(() => ({ env: null as ZugoidEnv | null }))
vi.mock('../../server/utils/cf', async original => ({
  ...await original<typeof import('../../server/utils/cf')>(),
  cf: () => ({ env: state.env! }),
}))
vi.mock('../../server/utils/auth', () => ({
  requireUser: async () => ({ id: ids.owner, kind: 'human', displayName: 'Owner', avatarR2Key: null }),
}))

afterEach(() => vi.unstubAllGlobals())

it('keeps the Server grants when a Member confirms an Agent proposal through a DM thread', async () => {
  const f = mcpFixture()
  try {
    state.env = f.env
    f.env.AGENT_SCHEDULE_DO = { getByName: () => ({ wake: async () => {} }) } as unknown as ZugoidEnv['AGENT_SCHEDULE_DO']
    const stamp = new Date().toISOString()
    f.db.exec("INSERT INTO channels(id,name,type,visibility) VALUES('dm-root-1','DM','dm','private')")
    const addMember = f.db.prepare("INSERT INTO channel_members(channel_id,user_id,joined_at) VALUES('dm-root-1',?,?)")
    addMember.run(ids.owner, stamp)
    addMember.run(ids.agent, stamp)
    f.db.prepare("INSERT INTO messages(id,channel_id,author_id,content,created_at) VALUES('dm-message','dm-root-1',?,'Schedule this',?)").run(ids.owner, stamp)
    f.db.exec("INSERT INTO channels(id,name,type,visibility,parent_id,parent_message_id) VALUES('dm-thread','Test','thread','private','dm-root-1','dm-message')")
    const { run } = await f.run()
    f.db.prepare("UPDATE agent_runs SET channel_id='dm-thread',source_message_id='dm-message' WHERE id=?").run(run.id)
    const proposal = await executeRunTool(f.env, run.id, { callId: 'prepare', name: 'prepare_work_schedule', arguments: {
      content: 'Return the test marker', recurrence: 'once', firstAt: new Date(Date.now() + 60000).toISOString(), timezone: 'UTC',
    } }, () => {}) as { id: string }
    f.db.prepare("UPDATE agent_runs SET status='completed' WHERE id=?").run(run.id)

    vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
    vi.stubGlobal('setHeader', vi.fn())
    vi.stubGlobal('getRouterParam', () => run.id)
    vi.stubGlobal('readBody', async () => ({ proposalId: proposal.id }))
    const { default: confirm } = await import('../../server/api/agent-runs/[id]/schedule.post')
    const { schedule } = await confirm({ context: {}, path: `/api/agent-runs/${run.id}/schedule`, method: 'POST' } as never)
    const current = await scheduleAuthorization(f.env, (await findSchedule(f.env, schedule.id))!)
    expect(hasPermission(current.principal.permissions, Permission.manageSchedules)).toBe(true)
  } finally {
    f.db.close()
  }
})
