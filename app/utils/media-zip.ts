/**
 * Reads a zip in place, without loading it: the central directory says where each file is, and a file is a slice of
 * the archive (stored) or that slice through the browser's own inflater (deflated). Google Takeout parts are tens of
 * gigabytes, so ZIP64 is the normal case, not the edge one.
 */
export type ZipEntry = {
  path: string
  size: number
  compressedSize: number
  method: number
  localHeaderOffset: number
  /** The file's time as the zip records it, in the archive's local time. */
  modified: Date | null
}

const EOCD = 0x06054b50, ZIP64_LOCATOR = 0x07064b50, ZIP64_EOCD = 0x06064b50, CENTRAL = 0x02014b50, LOCAL = 0x04034b50
const MAX = 0xFFFFFFFF

async function bytesAt(file: Blob, offset: number, length: number): Promise<DataView> {
  return new DataView(await file.slice(offset, offset + length).arrayBuffer())
}

const u64 = (view: DataView, at: number) => Number(view.getBigUint64(at, true))

function dosTime(date: number, time: number): Date | null {
  if (!date) return null
  const value = new Date((date >> 9) + 1980, ((date >> 5) & 15) - 1, date & 31, time >> 11, (time >> 5) & 63, (time & 31) * 2)
  return Number.isNaN(value.getTime()) ? null : value
}

export async function readZipEntries(file: Blob): Promise<ZipEntry[]> {
  const tailLength = Math.min(file.size, 65_557)
  const tail = await bytesAt(file, file.size - tailLength, tailLength)
  let end = -1
  for (let at = tailLength - 22; at >= 0; at--) {
    if (tail.getUint32(at, true) === EOCD) { end = at; break }
  }
  if (end < 0) throw new Error('This is not a zip archive, or it is cut short.')
  let count = tail.getUint16(end + 10, true)
  let size = tail.getUint32(end + 12, true)
  let offset = tail.getUint32(end + 16, true)
  if (count === 0xFFFF || size === MAX || offset === MAX) {
    const locatorAt = end - 20
    if (locatorAt < 0 || tail.getUint32(locatorAt, true) !== ZIP64_LOCATOR) throw new Error('This zip is missing its ZIP64 directory.')
    const record = await bytesAt(file, u64(tail, locatorAt + 8), 56)
    if (record.getUint32(0, true) !== ZIP64_EOCD) throw new Error('This zip is missing its ZIP64 directory.')
    count = u64(record, 32)
    size = u64(record, 40)
    offset = u64(record, 48)
  }
  const directory = await bytesAt(file, offset, size)
  const names = new TextDecoder('utf-8')
  const entries: ZipEntry[] = []
  let at = 0
  for (let index = 0; index < count && at + 46 <= directory.byteLength; index++) {
    if (directory.getUint32(at, true) !== CENTRAL) throw new Error('This zip directory is damaged.')
    const method = directory.getUint16(at + 10, true)
    const time = directory.getUint16(at + 12, true), date = directory.getUint16(at + 14, true)
    let compressedSize = directory.getUint32(at + 20, true)
    let entrySize = directory.getUint32(at + 24, true)
    const nameLength = directory.getUint16(at + 28, true), extraLength = directory.getUint16(at + 30, true), commentLength = directory.getUint16(at + 32, true)
    let localHeaderOffset = directory.getUint32(at + 42, true)
    const path = names.decode(new Uint8Array(directory.buffer, directory.byteOffset + at + 46, nameLength))
    // ZIP64 sizes live in extra field 0x0001, in this order, only for the values that overflowed.
    let extra = at + 46 + nameLength
    const extraEnd = extra + extraLength
    while (extra + 4 <= extraEnd) {
      const id = directory.getUint16(extra, true), length = directory.getUint16(extra + 2, true)
      if (id === 1) {
        let field = extra + 4
        if (entrySize === MAX) { entrySize = u64(directory, field); field += 8 }
        if (compressedSize === MAX) { compressedSize = u64(directory, field); field += 8 }
        if (localHeaderOffset === MAX) { localHeaderOffset = u64(directory, field) }
      }
      extra += 4 + length
    }
    if (!path.endsWith('/')) entries.push({ path, size: entrySize, compressedSize, method, localHeaderOffset, modified: dosTime(date, time) })
    at = extraEnd + commentLength
  }
  return entries
}

/** One file of the archive, as a Blob of its own bytes. */
export async function zipEntryBlob(file: Blob, entry: ZipEntry, type = ''): Promise<Blob> {
  const header = await bytesAt(file, entry.localHeaderOffset, 30)
  if (header.getUint32(0, true) !== LOCAL) throw new Error(`${entry.path}: the zip is damaged here.`)
  const start = entry.localHeaderOffset + 30 + header.getUint16(26, true) + header.getUint16(28, true)
  const raw = file.slice(start, start + entry.compressedSize)
  if (entry.method === 0) return type ? new Blob([raw], { type }) : raw
  if (entry.method !== 8) throw new Error(`${entry.path}: this kind of zip compression is not supported.`)
  const blob = await new Response(raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob()
  if (blob.size !== entry.size) throw new Error(`${entry.path}: the zip is damaged here.`)
  return type ? new Blob([blob], { type }) : blob
}
