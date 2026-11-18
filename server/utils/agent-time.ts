import { readServerSetting } from '../../shared/server-settings'
import type { ZugoidEnv } from '../../workers/env'
export async function agentTimeContext(env: ZugoidEnv, now = new Date()) {
  let timezone = await readServerSetting(env.DB, 'server.timezone') || 'UTC'
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format(now) } catch { timezone = 'UTC' }
  return { utc: now.toISOString(), timezone, localTime: new Intl.DateTimeFormat('en-CA', { timeZone: timezone, dateStyle: 'full', timeStyle: 'long' }).format(now) }
}
