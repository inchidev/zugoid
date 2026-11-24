/**
 * Google Takeout metadata: which file a sidecar JSON describes, what time it was taken, and how
 * a Takeout's zips pair the two. Parked here for the coming migrate-to-Zugoid importer; the core
 * Media import stays vendor-neutral.
 */

export type TakeoutCandidate = {
  path: string
  name: string
  size: number
  type: string
  modified: Date | null
  open: () => Promise<Blob>
  sidecar: (() => Promise<unknown>) | null
}

/**
 * A Takeout sidecar: `photoTakenTime.timestamp` in seconds, else `creationTime`. Returns an ISO time,
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

/**
 * Everything importable in one Takeout zip, each media file paired with its sidecar. `typeOf` decides
 * what counts as media, the way the core import's `mediaTypeOfName` does.
 */
export async function collectTakeoutZip(file: File, typeOf: (name: string) => string | null): Promise<TakeoutCandidate[]> {
  const { readZipEntries, zipEntryBlob } = await import('./media-zip')
  const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1)
  const media: TakeoutCandidate[] = []
  const sidecars = new Map<string, () => Promise<unknown>>()
  const readJson = (open: () => Promise<Blob>) => async () => { try { return JSON.parse(await (await open()).text()) } catch { return null } }
  for (const entry of await readZipEntries(file)) {
    const entryPath = `${file.name}/${entry.path}`
    const type = typeOf(entry.path)
    if (type) media.push({ path: entryPath, name: baseName(entry.path), size: entry.size, type, modified: entry.modified, open: () => zipEntryBlob(file, entry, type), sidecar: null })
    else if (entry.path.toLowerCase().endsWith('.json') && entry.size < 1_000_000) sidecars.set(entryPath, readJson(() => zipEntryBlob(file, entry)))
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
