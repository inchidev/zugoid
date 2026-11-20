import {
  isVideoType, MEDIA_PART_BYTES, MEDIA_SINGLE_UPLOAD_BYTES, MEDIA_THUMB_EDGE, matchTakeoutSidecars, mediaImportKey, mediaTypeOfName, takeoutTakenAt,
  type MediaItemDTO, type MediaTakenSource,
} from '~~/shared/media'
import { readZipEntries, zipEntryBlob } from './media-zip'

/**
 * Imports photos and videos into Media from what the person picks: single files, a folder, or Google Takeout zips.
 * Everything happens in the browser: the zips are read in place, capture times come from Takeout's sidecars or a
 * photo's EXIF, previews are drawn here, and a file the library already has is skipped before it is sent.
 */

type Candidate = {
  path: string
  name: string
  size: number
  type: string
  modified: Date | null
  open: () => Promise<Blob>
  sidecar: (() => Promise<unknown>) | null
}

export type ImportProgress = { total: number; done: number; skipped: number; failed: number; bytes: number; current: string | null; errors: string[] }
type Api = <T>(url: string, opts?: Record<string, unknown>) => Promise<T>

const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1)

/** Everything importable in what was picked, with each media file paired with its Takeout sidecar. */
export async function collectCandidates(files: readonly File[]): Promise<Candidate[]> {
  const media: Candidate[] = []
  const sidecars = new Map<string, () => Promise<unknown>>()
  const readJson = (open: () => Promise<Blob>) => async () => { try { return JSON.parse(await (await open()).text()) } catch { return null } }
  for (const file of files) {
    const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
    if (file.name.toLowerCase().endsWith('.zip')) {
      for (const entry of await readZipEntries(file)) {
        const entryPath = `${file.name}/${entry.path}`
        const type = mediaTypeOfName(entry.path)
        if (type) media.push({ path: entryPath, name: baseName(entry.path), size: entry.size, type, modified: entry.modified, open: () => zipEntryBlob(file, entry, type), sidecar: null })
        else if (entry.path.toLowerCase().endsWith('.json') && entry.size < 1_000_000) sidecars.set(entryPath, readJson(() => zipEntryBlob(file, entry)))
      }
      continue
    }
    const type = mediaTypeOfName(file.name)
    if (type) media.push({ path, name: file.name, size: file.size, type, modified: file.lastModified ? new Date(file.lastModified) : null, open: async () => file, sidecar: null })
    else if (file.name.toLowerCase().endsWith('.json') && file.size < 1_000_000) sidecars.set(path, readJson(async () => file))
  }
  // A sidecar names its file within the same archive: compare paths with the archive's own name taken off.
  const strip = (path: string) => path.replace(/^[^/]+\.zip\//iu, '')
  const byStripped = new Map(media.map(item => [strip(item.path), item]))
  const pairs = matchTakeoutSidecars([...byStripped.keys()], [...sidecars.keys()].map(strip))
  const sidecarByStripped = new Map([...sidecars].map(([path, read]) => [strip(path), read]))
  for (const [mediaPath, sidecarPath] of pairs) {
    const item = byStripped.get(mediaPath)
    if (item) item.sidecar = sidecarByStripped.get(sidecarPath) ?? null
  }
  return media
}

/** EXIF DateTimeOriginal of a JPEG, as written: local time with no zone, which is how cameras record it. */
async function exifTakenAt(blob: Blob): Promise<string | null> {
  const view = new DataView(await blob.slice(0, 256 * 1024).arrayBuffer())
  if (view.byteLength < 4 || view.getUint16(0) !== 0xFFD8) return null
  let at = 2
  while (at + 4 < view.byteLength) {
    const marker = view.getUint16(at), length = view.getUint16(at + 2)
    if (marker === 0xFFE1 && view.getUint32(at + 4) === 0x45786966) return readExif(view, at + 10)
    if ((marker & 0xFF00) !== 0xFF00 || marker === 0xFFDA) return null
    at += 2 + length
  }
  return null
}

function readExif(view: DataView, tiff: number): string | null {
  if (tiff + 8 > view.byteLength) return null
  const little = view.getUint16(tiff) === 0x4949
  const u16 = (at: number) => view.getUint16(at, little), u32 = (at: number) => view.getUint32(at, little)
  const tagIn = (ifd: number, wanted: number): number | null => {
    if (ifd + 2 > view.byteLength) return null
    const count = u16(ifd)
    for (let index = 0; index < count; index++) {
      const entry = ifd + 2 + index * 12
      if (entry + 12 > view.byteLength) return null
      if (u16(entry) === wanted) return entry
    }
    return null
  }
  const ascii = (entry: number) => {
    const length = u32(entry + 4), offset = length > 4 ? tiff + u32(entry + 8) : entry + 8
    if (offset + length > view.byteLength) return null
    return String.fromCharCode(...new Uint8Array(view.buffer, view.byteOffset + offset, length)).replace(/\0+$/u, '')
  }
  const ifd0 = tiff + u32(tiff + 4)
  const exifPointer = tagIn(ifd0, 0x8769)
  const original = exifPointer ? tagIn(tiff + u32(exifPointer + 8), 0x9003) : null
  const text = original ? ascii(original) : (() => { const entry = tagIn(ifd0, 0x0132); return entry ? ascii(entry) : null })()
  const match = text?.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/u)
  if (!match || match[1] === '0000') return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6]))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

async function takenAtOf(candidate: Candidate, blob: Blob): Promise<{ takenAt: string; source: MediaTakenSource }> {
  const fromSidecar = candidate.sidecar ? takeoutTakenAt(await candidate.sidecar()) : null
  if (fromSidecar) return { takenAt: fromSidecar, source: 'sidecar' }
  if (candidate.type === 'image/jpeg') {
    const fromExif = await exifTakenAt(blob).catch(() => null)
    if (fromExif) return { takenAt: fromExif, source: 'exif' }
  }
  if (candidate.modified) return { takenAt: candidate.modified.toISOString(), source: 'file' }
  return { takenAt: new Date().toISOString(), source: 'upload' }
}

type Look = { width: number | null; height: number | null; durationMs: number | null; thumb: Blob | null }

function scaled(width: number, height: number) {
  const ratio = Math.min(1, MEDIA_THUMB_EDGE / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) }
}

async function drawThumb(source: CanvasImageSource, width: number, height: number): Promise<Blob | null> {
  const size = scaled(width, height)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  canvas.getContext('2d')?.drawImage(source, 0, 0, size.width, size.height)
  const webp = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.78))
  return webp?.type === 'image/webp' ? webp : await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8))
}

/** Size, length and a preview. A format this browser cannot draw (HEIC outside Safari) gets no preview, not an error. */
async function lookAt(blob: Blob, type: string): Promise<Look> {
  if (!isVideoType(type)) {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })
      const thumb = await drawThumb(bitmap, bitmap.width, bitmap.height)
      const look = { width: bitmap.width, height: bitmap.height, durationMs: null, thumb }
      bitmap.close()
      return look
    }
    catch { return { width: null, height: null, durationMs: null, thumb: null } }
  }
  const url = URL.createObjectURL(blob)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.src = url
  try {
    await withTimeout(new Promise<void>((resolve, reject) => { video.onloadeddata = () => resolve(); video.onerror = () => reject(new Error('video')) }), 15_000)
    const durationMs = Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : null
    const width = video.videoWidth || null, height = video.videoHeight || null
    let thumb: Blob | null = null
    // A frame is drawable only once it is decoded: wait for the seek and for the frame itself, and try a second
    // moment if the first comes out blank (a fade from black, or a decoder that had not caught up).
    for (const at of width && height ? [Math.min(1, (video.duration || 0) / 2), Math.min(0.1, (video.duration || 0) / 4)] : []) {
      const seeked = new Promise<void>(resolve => { video.onseeked = () => resolve() })
      video.currentTime = at
      await withTimeout(seeked, 10_000).catch(() => undefined)
      if ('requestVideoFrameCallback' in video) await withTimeout(new Promise<void>(resolve => video.requestVideoFrameCallback(() => resolve())), 1500).catch(() => undefined)
      if (blankFrame(video)) continue
      thumb = await drawThumb(video, width!, height!).catch(() => null)
      break
    }
    return { width, height, durationMs, thumb }
  }
  catch { return { width: null, height: null, durationMs: null, thumb: null } }
  finally {
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
  }
}

/** Every sampled pixel near black: the frame was not ready, or the video starts dark. Either way, no preview from it. */
function blankFrame(video: HTMLVideoElement): boolean {
  const canvas = document.createElement('canvas')
  canvas.width = 32
  canvas.height = 18
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return false
  context.drawImage(video, 0, 0, 32, 18)
  const pixels = context.getImageData(0, 0, 32, 18).data
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index]! > 12 || pixels[index + 1]! > 12 || pixels[index + 2]! > 12) return false
  }
  return true
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))])
}

type Prepared = { candidate: Candidate; blob: Blob; takenAt: string; source: MediaTakenSource; key: string }

async function sendFile(api: Api, prepared: Prepared, look: Look): Promise<{ item: MediaItemDTO; existed: boolean }> {
  const meta = {
    filename: prepared.candidate.name, sizeBytes: prepared.blob.size, takenAt: prepared.takenAt, takenAtSource: prepared.source,
    width: look.width, height: look.height, durationMs: look.durationMs,
  }
  if (prepared.blob.size <= MEDIA_SINGLE_UPLOAD_BYTES) {
    return api('/api/media', { method: 'POST', query: meta, body: prepared.blob, headers: { 'Content-Type': 'application/octet-stream' } })
  }
  const started = await api<{ existed: true; item: MediaItemDTO } | { existed: false; upload: string; partBytes: number; parts: number }>('/api/media/uploads', { method: 'POST', body: meta })
  if (started.existed) return { item: started.item, existed: true }
  const parts: Array<{ partNumber: number; etag: string }> = []
  try {
    for (let partNumber = 1; partNumber <= started.parts; partNumber++) {
      const chunk = prepared.blob.slice((partNumber - 1) * MEDIA_PART_BYTES, partNumber * MEDIA_PART_BYTES)
      parts.push(await api(`/api/media/uploads/${started.upload}/${partNumber}`, { method: 'PUT', body: chunk, headers: { 'Content-Type': 'application/octet-stream' } }))
    }
    return await api(`/api/media/uploads/${started.upload}/complete`, { method: 'POST', body: { parts } })
  }
  catch (error) {
    await api(`/api/media/uploads/${started.upload}`, { method: 'DELETE' }).catch(() => undefined)
    throw error
  }
}

/**
 * Runs the import, a few files at a time. Files the library already has are checked in batches and never read twice.
 * `signal` stops it between files; what was imported stays.
 */
export async function runMediaImport(api: Api, candidates: Candidate[], progress: ImportProgress, signal: AbortSignal, onItem: (item: MediaItemDTO) => void) {
  progress.total = candidates.length
  const batchSize = 60
  for (let start = 0; start < candidates.length && !signal.aborted; start += batchSize) {
    const batch = candidates.slice(start, start + batchSize)
    // Capture time needs only the sidecar or the start of the file; the whole file is read only if it is new.
    const keyed = await Promise.all(batch.map(async (candidate) => {
      try {
        const head = candidate.type === 'image/jpeg' && !candidate.sidecar ? await candidate.open() : new Blob()
        const when = await takenAtOf(candidate, head)
        return { candidate, ...when, key: mediaImportKey(candidate.name, candidate.size, when.takenAt) }
      }
      catch (error) {
        progress.failed++
        progress.errors.push(`${candidate.path}: ${error instanceof Error ? error.message : 'could not be read'}`)
        return null
      }
    }))
    const ready = keyed.filter(value => value !== null)
    const known = new Set((await api<{ known: string[] }>('/api/media/check', { method: 'POST', body: { keys: ready.map(item => item.key) } })).known)
    const fresh = ready.filter((item) => {
      if (!known.has(item.key)) return true
      progress.skipped++
      progress.done++
      return false
    })
    const queue = [...fresh]
    const worker = async () => {
      while (queue.length && !signal.aborted) {
        const next = queue.shift()!
        progress.current = next.candidate.path
        try {
          const blob = await next.candidate.open()
          const look = await lookAt(blob, next.candidate.type)
          const sent = await sendFile(api, { ...next, blob }, look)
          if (look.thumb && !sent.existed) {
            await api(`/api/media/${sent.item.id}/thumb`, { method: 'PUT', body: look.thumb, headers: { 'Content-Type': look.thumb.type } })
              .then((result) => { sent.item.thumbUrl = (result as { thumbUrl: string }).thumbUrl })
              .catch(() => undefined)
          }
          if (sent.existed) progress.skipped++
          else { progress.bytes += blob.size; onItem(sent.item) }
        }
        catch (error) {
          progress.failed++
          if (progress.errors.length < 200) progress.errors.push(`${next.candidate.path}: ${errorText(error)}`)
        }
        finally { progress.done++ }
      }
    }
    await Promise.all([worker(), worker(), worker()])
    // A batch's files that were never looked at because of a stop still count as done for the totals.
    if (signal.aborted) break
  }
  progress.current = null
}

function errorText(error: unknown): string {
  const data = (error as { data?: { error?: { message?: string } } })?.data
  return data?.error?.message ?? (error instanceof Error ? error.message : 'failed')
}
