import type { AgentRun } from '../../shared/agent-execution'
import { scheduleProposalSchema, type ScheduleProposal } from '../../shared/schedules'
import type { ZugoidEnv } from '../../workers/env'

/** A completed tool receipt is the immutable proposal the person sees and approves. */
export async function scheduleProposals(env: ZugoidEnv, run: Pick<AgentRun, 'id' | 'status'>): Promise<ScheduleProposal[]> {
  if (run.status !== 'completed') return []
  const rows = await env.DB.prepare(`SELECT t.result_json AS result,
      EXISTS(SELECT 1 FROM agent_schedules s WHERE s.id=json_extract(t.result_json,'$.id')) AS confirmed
    FROM agent_run_tools t WHERE t.run_id=? AND t.name='prepare_work_schedule' AND t.status='completed'
    ORDER BY t.created_at,t.call_id LIMIT 5`).bind(run.id).all<{ result: string; confirmed: number }>()
  return rows.results.flatMap(row => {
    const proposal = scheduleProposalSchema.safeParse(JSON.parse(row.result))
    return proposal.success ? [{ ...proposal.data, confirmed: Boolean(row.confirmed) }] : []
  })
}
