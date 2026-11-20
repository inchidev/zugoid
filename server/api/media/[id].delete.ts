import { retryDeletedFiles } from '../../../shared/file-cleanup'
import { getServerId } from '../../../shared/server-id'
import { requireMember } from '../../utils/guards'
import { cf } from '../../utils/cf'
import { deleteMedia } from '../../utils/media'

export default defineEventHandler(async (event) => {
  const { env, waitUntil } = cf(event)
  const member = await requireMember(event, await getServerId(env.DB))
  await deleteMedia(env, member, getRouterParam(event, 'id')!)
  waitUntil(retryDeletedFiles(env))
  return { ok: true }
})
