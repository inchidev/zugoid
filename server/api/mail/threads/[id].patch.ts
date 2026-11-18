import { z } from 'zod'
import { nowIso } from '../../../../shared/ids'
import { requireMailboxPermission } from '../../../utils/server-mail'
import { cf, fail } from '../../../utils/cf'
import { parseBody } from '../../../utils/validate'
import { signalMailChanged } from '../../../../workers/mail-events'
import { conversationStatusForMail } from '../../../../workers/customer-records'

const schema = z.object({ status: z.enum(['inbox', 'archive', 'spam', 'trash']) })

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const access = await requireMailboxPermission(event, id, 'send')
  if (access.channel.type !== 'conversation') fail(404, 'not_found', 'Email conversation not found')
  const body = parseBody(schema, await readBody(event))
  const { env, waitUntil } = cf(event)
  await env.DB.prepare('UPDATE customer_conversations SET status = ?, updated_at = ? WHERE channel_id = ?').bind(conversationStatusForMail(body.status), nowIso(), id).run()
  waitUntil(signalMailChanged(env, access.mailboxId, id))
  return { ok: true }
})
