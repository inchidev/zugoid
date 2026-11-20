import { fileStorage } from '../../shared/file-storage'
import { newId, nowIso } from '../../shared/ids'
import {
  decodeMediaCursor, encodeMediaCursor, isVideoType, MEDIA_PAGE, MEDIA_PART_BYTES, MEDIA_SINGLE_UPLOAD_BYTES, MEDIA_THUMB_BYTES, mediaImportKey, sniffMediaType,
  type MediaItemDTO, type MediaPageDTO, type MediaTakenSource, type MediaUploadInput, type MediaVisibility,
} from '../../shared/media'
import { channelPath } from '../../shared/paths'
import { readServerSetting } from '../../shared/server-settings'
import { creationSpaceId, reachableSpaceIds, spaceSql } from '../../shared/spaces'
import type { ZugoidEnv } from '../../workers/env'
import { fail } from './cf'
import { requireChannelAccessForMember, type ServerMembership } from './channel-access'
import { writeAudit } from './messages'
import { requireRate, type RateRule } from './message-service'
import { requireStorageQuota } from './space-quota'

/** An import sends thousands of files; the Space's storage limit, not this, decides how much may be kept. */
const mediaUploadRate = (userId: string): RateRule => ({ key: `user:${userId}:media-upload`, limit: 3000, windowMs: 10 * 60_000 })
const UPLOAD_TTL_SECONDS = 24 * 3600

export type MediaRow = {
  id: string; spaceId: string; ownerId: string; visibility: MediaVisibility; r2Key: string; thumbR2Key: string | null
  filename: string; contentType: string; sizeBytes: number; width: number | null; height: number | null; durationMs: number | null
  takenAt: string; takenAtSource: MediaTakenSource; createdAt: string
}

const COLUMNS = `id, space_id AS spaceId, owner_id AS ownerId, visibility, r2_key AS r2Key, thumb_r2_key AS thumbR2Key, filename,
  content_type AS contentType, size_bytes AS sizeBytes, width, height, duration_ms AS durationMs, taken_at AS takenAt,
  taken_at_source AS takenAtSource, created_at AS createdAt`

export function mediaDto(row: MediaRow, viewerId: string): MediaItemDTO {
  return {
    id: row.id,
    filename: row.filename,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    width: row.width,
    height: row.height,
    durationMs: row.durationMs,
    takenAt: row.takenAt,
    takenAtSource: row.takenAtSource,
    visibility: row.visibility,
    mine: row.ownerId === viewerId,
    url: `/api/media/${row.id}/file`,
    thumbUrl: row.thumbR2Key ? `/api/media/${row.id}/thumb` : null,
    message: null,
  }
}

/** Where new items go: the active Space, or the only one this Member has. */
export function mediaSpace(member: ServerMembership): string {
  const spaceId = creationSpaceId(member.authorization)
  if (!spaceId) fail(400, 'space_required', 'Choose a Space first')
  return spaceId
}

/**
 * One item as this Member may see it: their own, or one shared with a Space they reach.
 * Anything else is 404, as if it did not exist.
 */
export async function requireMediaItem(env: ZugoidEnv, member: ServerMembership, id: string, intent: 'read' | 'own'): Promise<MediaRow> {
  const row = await env.DB.prepare(`SELECT ${COLUMNS} FROM media_items WHERE id = ? AND space_id IN (${spaceSql(member.authorization)})`).bind(id).first<MediaRow>()
  if (!row) fail(404, 'not_found', 'Not found in Media')
  const mine = row.ownerId === member.user.id
  if (!mine && (intent === 'own' || row.visibility !== 'space')) fail(404, 'not_found', 'Not found in Media')
  return row
}

/** The same file was imported before: the import skips it rather than storing it twice. */
async function existingImport(env: ZugoidEnv, ownerId: string, key: string): Promise<MediaRow | null> {
  return env.DB.prepare(`SELECT ${COLUMNS} FROM media_items WHERE owner_id = ? AND import_key = ?`).bind(ownerId, key).first<MediaRow>()
}

/** Which of these import keys this Member already has, so an import uploads only what is new. */
export async function knownImportKeys(env: ZugoidEnv, member: ServerMembership, keys: readonly string[]): Promise<string[]> {
  if (!keys.length) return []
  const rows = await env.DB.prepare('SELECT import_key AS key FROM media_items WHERE owner_id = ? AND import_key IN (SELECT value FROM json_each(?))')
    .bind(member.user.id, JSON.stringify(keys)).all<{ key: string }>()
  return (rows.results ?? []).map(row => row.key)
}

async function prepareUpload(env: ZugoidEnv, member: ServerMembership, input: MediaUploadInput) {
  const spaceId = mediaSpace(member)
  const importKey = mediaImportKey(input.filename, input.sizeBytes, input.takenAt)
  const existing = await existingImport(env, member.user.id, importKey)
  if (existing) return { spaceId, importKey, existing }
  await requireRate(env, mediaUploadRate(member.user.id), 'Too many uploads at once. The import goes on in a few minutes.')
  await requireStorageQuota(env, spaceId, input.sizeBytes)
  return { spaceId, importKey, existing: null }
}

const safeName = (name: string) => name.replace(/[^\w.() -]+/gu, '_').replace(/\s+/gu, ' ').trim().slice(0, 120) || 'media'
const keyFor = (serverId: string, spaceId: string, id: string, name: string) => `${serverId}/media/${spaceId}/${id}-${safeName(name).replace(/ /gu, '_')}`

/** Checks what was stored is the photo or video it claims to be, and of the size declared; removes it otherwise. */
async function verifyStored(env: ZugoidEnv, key: string, declaredSize: number): Promise<{ contentType: string; sizeBytes: number }> {
  const files = fileStorage(env)
  const [head, stored] = await Promise.all([files.get(key, { range: { offset: 0, length: 32 } }), files.head(key)])
  const contentType = head ? sniffMediaType(new Uint8Array(await head.arrayBuffer())) : null
  if (!contentType || !stored || stored.size !== declaredSize) {
    await files.delete(key)
    if (!contentType) fail(415, 'unsupported_type', 'Media takes photos and videos: JPEG, PNG, GIF, WebP, HEIC, AVIF, MP4, MOV or WebM.')
    fail(400, 'size_mismatch', 'The file arrived incomplete. Try it again.')
  }
  return { contentType, sizeBytes: stored.size }
}

async function insertItem(env: ZugoidEnv, member: ServerMembership, input: MediaUploadInput, prepared: { spaceId: string; importKey: string }, id: string, key: string, stored: { contentType: string; sizeBytes: number }): Promise<MediaRow> {
  const row: MediaRow = {
    id, spaceId: prepared.spaceId, ownerId: member.user.id, visibility: 'private', r2Key: key, thumbR2Key: null,
    filename: safeName(input.filename), contentType: stored.contentType, sizeBytes: stored.sizeBytes,
    width: input.width, height: input.height, durationMs: isVideoType(stored.contentType) ? input.durationMs : null,
    takenAt: new Date(input.takenAt).toISOString(), takenAtSource: input.takenAtSource, createdAt: nowIso(),
  }
  try {
    await env.DB.prepare(`INSERT INTO media_items(id,space_id,owner_id,visibility,r2_key,filename,content_type,size_bytes,width,height,duration_ms,taken_at,taken_at_source,import_key,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(row.id, row.spaceId, row.ownerId, row.visibility, row.r2Key, row.filename, row.contentType, row.sizeBytes,
      row.width, row.height, row.durationMs, row.takenAt, row.takenAtSource, prepared.importKey, row.createdAt).run()
  }
  catch (error) {
    await fileStorage(env).delete(key)
    // Two tabs importing the same file at once: the first one keeps it.
    const existing = await existingImport(env, member.user.id, prepared.importKey)
    if (existing) return existing
    throw error
  }
  return row
}

/** A file of up to MEDIA_SINGLE_UPLOAD_BYTES as one request body, streamed straight to storage. */
export async function uploadMedia(env: ZugoidEnv, member: ServerMembership, input: MediaUploadInput, body: ReadableStream<Uint8Array> | Uint8Array | null, declaredLength: number) {
  if (!body || !Number.isFinite(declaredLength) || declaredLength !== input.sizeBytes) fail(411, 'length_required', 'Send the file with its size')
  if (input.sizeBytes > MEDIA_SINGLE_UPLOAD_BYTES) fail(413, 'too_large', 'Send a file this large in parts')
  const prepared = await prepareUpload(env, member, input)
  if (prepared.existing) {
    if (body instanceof ReadableStream) await body.cancel().catch(() => {})
    return { item: mediaDto(prepared.existing, member.user.id), existed: true }
  }
  const id = newId(), key = keyFor(member.serverId, prepared.spaceId, id, input.filename)
  await fileStorage(env).put(key, body)
  const stored = await verifyStored(env, key, input.sizeBytes)
  const row = await insertItem(env, member, input, prepared, id, key, stored)
  return { item: mediaDto(row, member.user.id), existed: row.id !== id }
}

type PendingUpload = { ownerId: string; spaceId: string; key: string; uploadId: string; input: MediaUploadInput; importKey: string; id: string }
const pendingKey = (token: string) => `media-upload:${token}`

/** Large files need R2's multipart upload; basic storage keeps files whole and small. */
async function requireMultipart(env: ZugoidEnv): Promise<R2Bucket> {
  if (!env.FILES || await readServerSetting(env.DB, 'storage.backend') === 'kv') fail(409, 'multipart_unavailable', 'Files over 95 MB need R2 file storage. Ask the Server operator to connect it.')
  return env.FILES
}

export async function startMultipart(env: ZugoidEnv, member: ServerMembership, input: MediaUploadInput) {
  const prepared = await prepareUpload(env, member, input)
  if (prepared.existing) return { existed: true as const, item: mediaDto(prepared.existing, member.user.id) }
  const bucket = await requireMultipart(env)
  const id = newId(), key = keyFor(member.serverId, prepared.spaceId, id, input.filename)
  const upload = await bucket.createMultipartUpload(key)
  const token = newId()
  const pending: PendingUpload = { ownerId: member.user.id, spaceId: prepared.spaceId, key, uploadId: upload.uploadId, input, importKey: prepared.importKey, id }
  await env.TICKETS.put(pendingKey(token), JSON.stringify(pending), { expirationTtl: UPLOAD_TTL_SECONDS })
  return { existed: false as const, upload: token, partBytes: MEDIA_PART_BYTES, parts: Math.ceil(input.sizeBytes / MEDIA_PART_BYTES) }
}

async function pendingUpload(env: ZugoidEnv, member: ServerMembership, token: string): Promise<PendingUpload> {
  const raw = /^[\w-]{8,64}$/u.test(token) ? await env.TICKETS.get(pendingKey(token)) : null
  const pending = raw ? JSON.parse(raw) as PendingUpload : null
  if (!pending || pending.ownerId !== member.user.id) fail(404, 'not_found', 'This upload has expired. Start it again.')
  return pending
}

export async function uploadPart(env: ZugoidEnv, member: ServerMembership, token: string, partNumber: number, body: ReadableStream<Uint8Array> | Uint8Array | null, declaredLength: number) {
  const pending = await pendingUpload(env, member, token)
  const parts = Math.ceil(pending.input.sizeBytes / MEDIA_PART_BYTES)
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > parts) fail(400, 'bad_request', 'No such part')
  const expected = partNumber < parts ? MEDIA_PART_BYTES : pending.input.sizeBytes - MEDIA_PART_BYTES * (parts - 1)
  if (!body || declaredLength !== expected) fail(400, 'bad_request', `Part ${partNumber} is ${expected} bytes`)
  const bucket = await requireMultipart(env)
  const bytes = body instanceof Uint8Array ? body : new Uint8Array(await new Response(body).arrayBuffer())
  if (bytes.byteLength !== expected) fail(400, 'bad_request', `Part ${partNumber} arrived incomplete`)
  const part = await bucket.resumeMultipartUpload(pending.key, pending.uploadId).uploadPart(partNumber, bytes)
  return { partNumber: part.partNumber, etag: part.etag }
}

export async function completeMultipart(env: ZugoidEnv, member: ServerMembership, token: string, parts: Array<{ partNumber: number; etag: string }>) {
  const pending = await pendingUpload(env, member, token)
  const bucket = await requireMultipart(env)
  const upload = bucket.resumeMultipartUpload(pending.key, pending.uploadId)
  try { await upload.complete([...parts].sort((a, b) => a.partNumber - b.partNumber)) }
  catch { fail(400, 'incomplete_upload', 'Some parts of the file did not arrive. Try it again.') }
  await env.TICKETS.delete(pendingKey(token))
  const stored = await verifyStored(env, pending.key, pending.input.sizeBytes)
  const row = await insertItem(env, member, pending.input, { spaceId: pending.spaceId, importKey: pending.importKey }, pending.id, pending.key, stored)
  return { item: mediaDto(row, member.user.id), existed: row.id !== pending.id }
}

export async function abortMultipart(env: ZugoidEnv, member: ServerMembership, token: string) {
  const pending = await pendingUpload(env, member, token)
  await env.TICKETS.delete(pendingKey(token))
  if (env.FILES) await env.FILES.resumeMultipartUpload(pending.key, pending.uploadId).abort().catch(() => {})
}

/** A small preview the browser made: a JPEG or WebP, replaced whole each time. */
export async function setMediaThumb(env: ZugoidEnv, member: ServerMembership, id: string, bytes: Uint8Array) {
  const row = await requireMediaItem(env, member, id, 'own')
  const type = sniffMediaType(bytes)
  if (bytes.byteLength > MEDIA_THUMB_BYTES || (type !== 'image/jpeg' && type !== 'image/webp')) fail(400, 'bad_request', 'A preview is a JPEG or WebP under 512 KB')
  const key = `${row.r2Key}.thumb`
  await fileStorage(env).put(key, bytes, { httpMetadata: { contentType: type } })
  await env.DB.prepare('UPDATE media_items SET thumb_r2_key = ? WHERE id = ?').bind(key, id).run()
  return { thumbUrl: `/api/media/${id}/thumb` }
}

export async function setMediaVisibility(env: ZugoidEnv, member: ServerMembership, id: string, visibility: MediaVisibility) {
  const row = await requireMediaItem(env, member, id, 'own')
  await env.DB.prepare('UPDATE media_items SET visibility = ? WHERE id = ?').bind(visibility, id).run()
  return { item: mediaDto({ ...row, visibility }, member.user.id) }
}

/** The row goes now; its files are queued and removed by the same cleanup that removes a deleted message's files. */
export async function deleteMedia(env: ZugoidEnv, member: ServerMembership, id: string) {
  const row = await requireMediaItem(env, member, id, 'own')
  const now = nowIso()
  await env.DB.batch([
    ...[row.r2Key, row.thumbR2Key].filter((key): key is string => Boolean(key)).map(key =>
      env.DB.prepare('INSERT OR IGNORE INTO file_deletions(key, scope_id, created_at) VALUES(?,?,?)').bind(key, row.spaceId, now)),
    env.DB.prepare('DELETE FROM media_items WHERE id = ?').bind(id),
  ])
  await writeAudit(env, { serverId: member.serverId, actorId: member.user.id, action: 'media.delete', targetType: 'media', targetId: id, meta: { sizeBytes: row.sizeBytes }, authorization: member.authorization })
}

/** A page of the timeline, newest first. */
export async function listMedia(env: ZugoidEnv, member: ServerMembership, source: 'mine' | 'space' | 'chats', cursorText?: string): Promise<MediaPageDTO> {
  const cursor = decodeMediaCursor(cursorText)
  if (cursorText && !cursor) fail(400, 'bad_request', 'Invalid cursor')
  if (source === 'chats') return listChatMedia(env, member, cursor)
  const where = source === 'mine' ? 'owner_id = ?1' : "owner_id <> ?1 AND visibility = 'space'"
  const rows = await env.DB.prepare(`SELECT ${COLUMNS} FROM media_items
    WHERE space_id IN (${spaceSql(member.authorization)}) AND ${where}
      AND (?2 = 0 OR taken_at < ?3 OR (taken_at = ?3 AND id < ?4))
    ORDER BY taken_at DESC, id DESC LIMIT ?5`)
    .bind(member.user.id, cursor ? 1 : 0, cursor?.takenAt ?? '', cursor?.id ?? '', MEDIA_PAGE + 1).all<MediaRow>()
  const list = rows.results ?? []
  const page = list.slice(0, MEDIA_PAGE)
  const last = page.at(-1)
  return {
    items: page.map(row => mediaDto(row, member.user.id)),
    nextCursor: list.length > MEDIA_PAGE && last ? encodeMediaCursor(last.takenAt, last.id) : null,
  }
}

type ChatRow = {
  id: string; filename: string; contentType: string; sizeBytes: number; width: number | null; height: number | null; createdAt: string
  uploaderId: string; messageId: string; channelId: string; rootId: string
}

/**
 * Photos and videos sent in conversations this Member can read, by when they were sent. The query only narrows;
 * each conversation's own access check decides, as in search, so a page may hold fewer than a full page.
 */
async function listChatMedia(env: ZugoidEnv, member: ServerMembership, cursor: { takenAt: string; id: string } | null): Promise<MediaPageDTO> {
  const rows = await env.DB.prepare(`SELECT a.id, a.filename, a.content_type AS contentType, a.size_bytes AS sizeBytes, a.width, a.height,
      a.created_at AS createdAt, a.uploader_id AS uploaderId, a.message_id AS messageId, a.channel_id AS channelId, root.id AS rootId
    FROM attachments a
    JOIN messages m ON m.id = a.message_id AND m.deleted_at IS NULL
    JOIN channels c ON c.id = a.channel_id
    JOIN channels root ON root.id = CASE WHEN c.type IN ('thread', 'conversation') AND c.parent_id IS NOT NULL THEN c.parent_id ELSE c.id END
    WHERE (a.content_type LIKE 'image/%' OR a.content_type LIKE 'video/%')
      AND root.space_id IN (SELECT value FROM json_each(?1))
      AND (root.visibility = 'server' OR EXISTS (SELECT 1 FROM channel_members cm WHERE cm.channel_id = root.id AND cm.user_id = ?2))
      AND (?3 = 0 OR a.created_at < ?4 OR (a.created_at = ?4 AND a.id < ?5))
    ORDER BY a.created_at DESC, a.id DESC LIMIT ?6`)
    .bind(JSON.stringify(reachableSpaceIds(member.authorization)), member.user.id, cursor ? 1 : 0, cursor?.takenAt ?? '', cursor?.id ?? '', MEDIA_PAGE + 1).all<ChatRow>()
  const list = rows.results ?? []
  const page = list.slice(0, MEDIA_PAGE)
  const roots = new Map<string, Promise<boolean>>()
  for (const row of page) {
    if (!roots.has(row.rootId)) roots.set(row.rootId, requireChannelAccessForMember(env, member, row.rootId).then(() => true, () => false))
  }
  const allowed = new Map(await Promise.all([...roots].map(async ([id, ok]) => [id, await ok] as const)))
  const last = page.at(-1)
  return {
    items: page.filter(row => allowed.get(row.rootId)).map(row => ({
      id: row.id, filename: row.filename, contentType: row.contentType, sizeBytes: row.sizeBytes, width: row.width, height: row.height,
      durationMs: null, takenAt: row.createdAt, takenAtSource: 'upload', visibility: 'space', mine: row.uploaderId === member.user.id,
      url: `/api/files/${row.id}`, thumbUrl: null,
      message: { channelId: row.channelId, messageId: row.messageId, path: `${channelPath(row.rootId, row.channelId === row.rootId ? undefined : row.channelId)}?message=${encodeURIComponent(row.messageId)}` },
    })),
    nextCursor: list.length > MEDIA_PAGE && last ? encodeMediaCursor(last.createdAt, last.id) : null,
  }
}

/** Serves a stored file, whole or a byte range of it, for the browser's image and video elements. */
export async function serveMediaFile(event: import('h3').H3Event, env: ZugoidEnv, key: string, contentType: string, filename: string) {
  const { fileResponseHeaders } = await import('../../shared/file-response')
  const { parseByteRange } = await import('../../shared/http-range')
  const files = fileStorage(env)
  const rangeHeader = getHeader(event, 'range')
  let obj: import('../../shared/file-storage').FileBody | null
  if (rangeHeader) {
    const metadata = await files.head(key)
    if (!metadata) fail(404, 'not_found', 'File missing')
    const range = parseByteRange(rangeHeader, metadata.size)
    if (!range) {
      setHeader(event, 'Content-Range', `bytes */${metadata.size}`)
      fail(416, 'range_not_satisfiable', 'Requested file range is not satisfiable')
    }
    obj = await files.get(key, { range: { offset: range.offset, length: range.length } })
    setResponseStatus(event, 206)
    setHeader(event, 'Content-Range', `bytes ${range.start}-${range.end}/${metadata.size}`)
    setHeader(event, 'Content-Length', range.length)
  }
  else {
    obj = await files.get(key)
    if (obj) setHeader(event, 'Content-Length', obj.size)
  }
  if (!obj) fail(404, 'not_found', 'File missing')
  for (const [name, value] of Object.entries(fileResponseHeaders(contentType, filename))) setHeader(event, name, value)
  // Items never change once stored, and only their owner or their Space may fetch them.
  setHeader(event, 'Cache-Control', 'private, max-age=86400')
  setHeader(event, 'Accept-Ranges', 'bytes')
  setHeader(event, 'ETag', obj.httpEtag)
  return obj.body
}

/** The request body as it arrives: streamed on a Worker, read whole elsewhere. */
export async function rawBody(event: import('h3').H3Event): Promise<ReadableStream<Uint8Array> | Uint8Array | null> {
  const { cf } = await import('./cf')
  const { request } = cf(event)
  // Some runtimes hand the body to h3 before the route runs; then the stream is locked and h3 has it.
  const stream = request?.body as ReadableStream<Uint8Array> | null | undefined
  if (stream && !stream.locked) return stream
  const bytes = await readRawBody(event, false)
  return bytes ? new Uint8Array(bytes) : null
}
