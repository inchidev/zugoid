import type { ServerMembersChangedEvent } from '../shared/server-realtime'
import type { ZugoidEnv } from './env'
import { asRpc } from './env'

export async function signalMembersChanged(env: ZugoidEnv, serverId: string): Promise<void> {
  const event: ServerMembersChangedEvent = { t: 'members.changed', serverId }
  await asRpc<{
    notifyMembersChanged: (event: ServerMembersChangedEvent) => Promise<void>
  }>(env.SERVER_DO.getByName(`server:${serverId}`)).notifyMembersChanged(event)
}
