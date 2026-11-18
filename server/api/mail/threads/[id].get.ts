import { asc, eq } from 'drizzle-orm'
import { messages } from '../../../../drizzle/schema'
import type { MailMessageDTO, MailThreadDTO } from '../../../../shared/types'
import { requireMailboxPermission } from '../../../utils/server-mail'
import { cf, fail } from '../../../utils/cf'
import { getDb } from '../../../utils/db'
import { hydrateMailMessages, MAIL_THREAD_COLUMNS, MAIL_THREAD_FROM, mailThreadDto } from '../../../utils/mail-data'

/** A conversation and its messages. Opening it does not mark it read; see read.post. */
export default defineEventHandler(async (event): Promise<{ thread: MailThreadDTO; messages: MailMessageDTO[] }> => {
  const id = getRouterParam(event, 'id')!
  const access = await requireMailboxPermission(event, id, 'read')
  if (access.channel.type !== 'conversation') fail(404, 'not_found', 'Email conversation not found')
  const { env } = cf(event)
  const db = getDb(env.DB)
  const [row, messageRows] = await Promise.all([
    env.DB.prepare(`SELECT ${MAIL_THREAD_COLUMNS} FROM ${MAIL_THREAD_FROM} WHERE t.channel_id = ?`)
      .bind(id).first<Parameters<typeof mailThreadDto>[0]>(),
    db.select().from(messages).where(eq(messages.channelId, id)).orderBy(asc(messages.createdAt), asc(messages.id)),
  ])
  if (!row) fail(404, 'not_found', 'Email conversation not found')
  const hydrated = await hydrateMailMessages(env, messageRows, access.user.id)
  return {
    thread: { ...mailThreadDto({ ...row, preview: hydrated.at(-1)?.content ?? '' }), unread: false },
    messages: hydrated,
  }
})
