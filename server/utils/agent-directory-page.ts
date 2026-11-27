import type { ZugoidEnv } from '../../workers/env'
import type { AgentDTO } from '../../shared/types'
import type { AuthorizationContext } from '../../shared/authorization'
import { agentInSpacesSql } from './agent-access'
export type AgentDirectoryKind = 'built-in' | 'external'

export async function agentDirectoryPage(env: ZugoidEnv, search: string, page: number, auth: Pick<AuthorizationContext, 'spaces'>, kind?: AgentDirectoryKind) {
  const hasWebhook = 'EXISTS (SELECT 1 FROM agent_webhooks webhook WHERE webhook.agent_id=a.user_id)'
  const kindFilter = kind ? ` AND ${kind === 'built-in' ? 'NOT ' : ''}${hasWebhook}` : ''
  const where = `FROM agents a JOIN users u ON u.id=a.user_id WHERE u.status='active' AND u.kind='agent' AND ${agentInSpacesSql(auth, 'u.id')} AND instr(lower(u.display_name),?)>0${kindFilter}`
  const count = await env.DB.prepare(`SELECT count(*) as total ${where}`).bind(search.toLowerCase()).first<{ total: number }>()
  const rows = await env.DB.prepare(`SELECT u.id,u.role_id as roleId,u.display_name as displayName,u.avatar_r2_key as avatarR2Key,a.model,a.harness,a.instructions,a.status,a.last_active_at as lastActiveAt,a.created_at as createdAt,a.updated_at as updatedAt ${where} ORDER BY lower(u.display_name),u.id LIMIT 15 OFFSET ?`).bind(search.toLowerCase(), (page - 1) * 15).all<AgentDTO>()
  return { agents: rows.results, total: count?.total ?? 0 }
}
