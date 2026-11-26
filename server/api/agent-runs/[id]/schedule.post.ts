import { z } from 'zod'
import { Permission } from '../../../../shared/permissions'
import { findAgentRun, runAuthorization } from '../../../utils/agent-run-service'
import { requireRunReader } from '../../../utils/agent-tool-security'
import { cf, fail } from '../../../utils/cf'
import { requireChannelAccess } from '../../../utils/guards'
import { canProposeWorkSchedule, scheduleProposals } from '../../../utils/schedule-proposals'
import { createSchedule } from '../../../utils/schedule-service'
import { parseBody } from '../../../utils/validate'

const bodySchema = z.object({ proposalId: z.uuid() }).strict()

export default defineEventHandler(async event => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const { env } = cf(event)
  const run = await findAgentRun(env, getRouterParam(event, 'id')!)
  if (!run) fail(404, 'not_found', 'Run not found')
  const actor = await requireChannelAccess(event, run.channelId, Permission.sendMessages)
  requireRunReader(run, actor.user.id)
  const { proposalId } = parseBody(bodySchema, await readBody(event))
  const proposal = (await scheduleProposals(env, run)).find(item => item.id === proposalId)
  if (!proposal || proposal.input.channelId !== run.channelId || proposal.input.agentId !== run.agentId || proposal.input.kind !== 'work') {
    fail(404, 'not_found', 'Schedule proposal not found')
  }
  if (!canProposeWorkSchedule(await runAuthorization(env, run))) fail(403, 'schedule_denied', 'Manage schedules is required to confirm this proposal')
  return { schedule: await createSchedule(env, actor.authorization, proposal.input, proposal.id) }
})
