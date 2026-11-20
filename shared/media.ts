import { z } from 'zod'

/** Who sees an item in Media: only its owner, or everyone in its Space. */
export const MEDIA_VISIBILITY = ['private', 'space'] as const
export type MediaVisibility = typeof MEDIA_VISIBILITY[number]

/** Where an item's capture time came from, best first. `upload` means nothing better was known. */
export const MEDIA_TAKEN_SOURCES = ['exif', 'sidecar', 'file', 'upload'] as const
export type MediaTakenSource = typeof MEDIA_TAKEN_SOURCES[number]

/** One request carries at most this much: a Worker reads up to 100 MB of body. Larger files go in parts. */
export const MEDIA_SINGLE_UPLOAD_BYTES = 95 * 1024 * 1024
/**
 * A part of a multipart upload. R2 needs every part but the last to be the same size, at least 5 MiB. A part is read
 * whole before it is stored (not every runtime takes a stream for a part), so it stays well inside a Worker's memory.
 */
export const MEDIA_PART_BYTES = 32 * 1024 * 1024
export const MEDIA_MAX_BYTES = 10 * 1024 * 1024 * 1024
export const MEDIA_THUMB_BYTES = 512 * 1024
export const MEDIA_THUMB_EDGE = 480
export const MEDIA_PAGE = 120

/** Photos and videos only. The type is the file's, checked again on the Server from its first bytes. */
const MEDIA_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  heic: 'image/heic', heif: 'image/heif', avif: 'image/avif',
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', '3gp': 'video/3gpp',
}

export function mediaTypeOfName(name: string): string | null {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  return MEDIA_TYPES[ext] ?? null
}

export const isVideoType = (type: string) => type.startsWith('video/')

/**
 * What the first bytes say a media file is. Container names come from the bytes, never from the name,
 * so nothing but a photo or a video is ever stored or served inline from Media.
 */
export function sniffMediaType(bytes: Uint8Array): string | null {
  const at = (offset: number, ...values: number[]) => values.every((value, index) => bytes[offset + index] === value)
  const ascii = (offset: number, length: number) => String.fromCharCode(...bytes.slice(offset, offset + length))
  if (at(0, 0xFF, 0xD8, 0xFF)) return 'image/jpeg'
  if (at(0, 0x89, 0x50, 0x4E, 0x47)) return 'image/png'
  if (ascii(0, 4) === 'GIF8') return 'image/gif'
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'image/webp'
  if (at(0, 0x1A, 0x45, 0xDF, 0xA3)) return 'video/webm'
  if (ascii(4, 4) === 'ftyp') {
    const brand = ascii(8, 4)
    if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis'].includes(brand)) return 'image/heic'
    if (['mif1', 'msf1'].includes(brand)) return 'image/heif'
    if (brand === 'avif' || brand === 'avis') return 'image/avif'
    if (brand === 'qt  ') return 'video/quicktime'
    if (brand.startsWith('3gp')) return 'video/3gpp'
    return 'video/mp4'
  }
  return null
}

/** The same file from the same person is one item: name, size and capture time say it is the same. */
export function mediaImportKey(filename: string, sizeBytes: number, takenAt: string): string {
  return `${filename.toLowerCase()}|${sizeBytes}|${takenAt.slice(0, 19)}`
}

export const mediaUploadSchema = z.object({
  filename: z.string().trim().min(1).max(200),
  sizeBytes: z.coerce.number().int().positive().max(MEDIA_MAX_BYTES),
  takenAt: z.string().datetime({ offset: true }),
  takenAtSource: z.enum(MEDIA_TAKEN_SOURCES),
  width: z.coerce.number().int().positive().max(100_000).nullable().default(null),
  height: z.coerce.number().int().positive().max(100_000).nullable().default(null),
  durationMs: z.coerce.number().int().nonnegative().max(48 * 3600_000).nullable().default(null),
})
export type MediaUploadInput = z.infer<typeof mediaUploadSchema>

export const mediaPatchSchema = z.object({ visibility: z.enum(MEDIA_VISIBILITY) }).strict()

export const mediaListQuery = z.object({
  /** `mine`: my library. `space`: what others in the Space shared. `chats`: photos and videos from conversations. */
  source: z.enum(['mine', 'space', 'chats']).default('mine'),
  cursor: z.string().max(200).optional(),
})

export type MediaItemDTO = {
  id: string
  filename: string
  contentType: string
  sizeBytes: number
  width: number | null
  height: number | null
  durationMs: number | null
  takenAt: string
  takenAtSource: MediaTakenSource
  visibility: MediaVisibility
  mine: boolean
  url: string
  thumbUrl: string | null
  /** Where a photo from a conversation was sent; null for a library item. */
  message: { channelId: string; messageId: string; path: string } | null
}

export type MediaPageDTO = { items: MediaItemDTO[]; nextCursor: string | null }

/** `<takenAt>|<id>`: items are ordered by capture time, newest first, and the id breaks ties. */
export function encodeMediaCursor(takenAt: string, id: string): string {
  return `${takenAt}|${id}`
}
export function decodeMediaCursor(cursor: string | undefined): { takenAt: string; id: string } | null {
  if (!cursor) return null
  const [takenAt, id] = cursor.split('|')
  return takenAt && id && !Number.isNaN(Date.parse(takenAt)) ? { takenAt, id } : null
}

/**
 * A Google Takeout sidecar: `photoTakenTime.timestamp` in seconds, else `creationTime`. Returns an ISO time,
 * or null when the JSON says nothing usable.
 */
export function takeoutTakenAt(json: unknown): string | null {
  const read = (key: string) => {
    const value = (json as Record<string, { timestamp?: unknown } | undefined> | null)?.[key]?.timestamp
    const seconds = Number(value)
    return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : null
  }
  return read('photoTakenTime') ?? read('creationTime')
}

/**
 * The media file a Takeout sidecar describes. Takeout names it `<media>.json` or `<media>.supplemental-metadata.json`,
 * cut to 46 characters before `.json`, and puts a copy's `(1)` after the extension: `IMG.jpg(1).json` is `IMG(1).jpg`.
 */
export function takeoutSidecarTarget(path: string): string | null {
  if (!path.toLowerCase().endsWith('.json')) return null
  const slash = path.lastIndexOf('/')
  const folder = path.slice(0, slash + 1)
  let name = path.slice(slash + 1, -'.json'.length)
  const copy = name.match(/^(.*)\((\d+)\)$/u)
  if (copy) name = copy[1]!
  name = name.replace(/\.(supplemental-metadata|supplemental-metadat|supplemental-metad|supplemental-meta|supplemental-me|supplemental-m|supplemental-|supplemental|supplementa|supplement|supplemen|suppleme|supplem|supple|suppl|supp|sup|su|s)$/u, '')
  if (!name || name === 'metadata' || name.startsWith('print-subscriptions') || name.startsWith('shared_album_comments') || name.startsWith('user-generated-memory-titles')) return null
  if (copy) {
    const dot = name.lastIndexOf('.')
    name = dot > 0 ? `${name.slice(0, dot)}(${copy[2]})${name.slice(dot)}` : `${name}(${copy[2]})`
  }
  return folder + name
}

const folderOf = (path: string) => path.slice(0, path.lastIndexOf('/') + 1)
const stemOf = (path: string) => { const name = path.slice(folderOf(path).length); const dot = name.lastIndexOf('.'); return folderOf(path) + (dot > 0 ? name.slice(0, dot) : name).toLowerCase() }

/** Takeout cuts long names at 47 characters, extension included, so a sidecar may name only the start of its file. */
export function takeoutNameMatches(sidecarTarget: string, mediaPath: string): boolean {
  if (sidecarTarget === mediaPath) return true
  if (folderOf(sidecarTarget) !== folderOf(mediaPath)) return false
  const target = sidecarTarget.slice(folderOf(sidecarTarget).length)
  const media = mediaPath.slice(folderOf(mediaPath).length)
  return target.length >= 40 && media.startsWith(target)
}

/**
 * Pairs each media path with the sidecar that describes it: the exact name, a name Takeout cut short, or for the
 * video half of a Live Photo (`IMG_1.MP4` beside `IMG_1.HEIC`, which alone has a sidecar) the photo's.
 */
export function matchTakeoutSidecars(mediaPaths: readonly string[], sidecarPaths: readonly string[]): Map<string, string> {
  const byTarget = new Map<string, string>()
  for (const sidecar of sidecarPaths) {
    const target = takeoutSidecarTarget(sidecar)
    if (target) byTarget.set(target, sidecar)
  }
  const byFolder = new Map<string, string[]>()
  for (const target of byTarget.keys()) {
    const list = byFolder.get(folderOf(target)) ?? []
    list.push(target)
    byFolder.set(folderOf(target), list)
  }
  const matched = new Map<string, string>()
  for (const path of mediaPaths) {
    const exact = byTarget.get(path)
    if (exact) { matched.set(path, exact); continue }
    const cut = byFolder.get(folderOf(path))?.find(target => takeoutNameMatches(target, path))
    if (cut) matched.set(path, byTarget.get(cut)!)
  }
  const byStem = new Map<string, string>()
  for (const [path, sidecar] of matched) byStem.set(stemOf(path), sidecar)
  for (const path of mediaPaths) {
    if (matched.has(path)) continue
    // An edited copy (`IMG_1-edited.JPG`) has no sidecar of its own either: it was taken when the original was.
    const sibling = byStem.get(stemOf(path)) ?? byStem.get(stemOf(path).replace(/-(edited|bearbeitet|modifié|editado|modificato|изменено)$/u, ''))
    if (sibling) matched.set(path, sibling)
  }
  return matched
}
