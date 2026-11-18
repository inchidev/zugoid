import { storedExecutionPolicy } from '../../shared/agent-execution-policy'
import { readServerSetting } from '../../shared/server-settings'
import type { ZugoidEnv } from '../../workers/env'

export const AGENT_EXECUTION_POLICY_KEY = 'agents.executionPolicy'
/** Settings saved before the box keep working: their per-command limits are ignored. */
export async function agentExecutionPolicy(env: Pick<ZugoidEnv, 'DB'>) {
  const value = await readServerSetting(env.DB, AGENT_EXECUTION_POLICY_KEY)
  return storedExecutionPolicy(value ? JSON.parse(value) : {})
}
