import { describe, expect, it } from 'vitest'
import { readZipEntries, zipEntryBlob } from './media-zip'
import { matchTakeoutSidecars, takeoutSidecarTarget, takeoutTakenAt } from './takeout'

describe('Takeout sidecars', () => {
  it('names the file a sidecar describes, as Takeout writes them', () => {
    expect(takeoutSidecarTarget('P/IMG_1.JPG.supplemental-metadata.json')).toBe('P/IMG_1.JPG')
    expect(takeoutSidecarTarget('P/IMG_1.JPG.json')).toBe('P/IMG_1.JPG')
    expect(takeoutSidecarTarget('P/IMG_1.JPG.supplemental-metadata(1).json')).toBe('P/IMG_1(1).JPG')
    expect(takeoutSidecarTarget('P/a-very-long-name-cut-by-google.jpg.supplemen.json')).toBe('P/a-very-long-name-cut-by-google.jpg')
    expect(takeoutSidecarTarget('P/metadata.json')).toBeNull()
    expect(takeoutSidecarTarget('P/IMG_1.JPG')).toBeNull()
  })

  it('pairs Live Photo videos and edited copies with the photo they came from', () => {
    const media = ['P/IMG_2.HEIC', 'P/IMG_2.MP4', 'P/IMG_3.JPG', 'P/IMG_3-edited.JPG', 'P/IMG_4(1).JPG', 'P/lonely.png']
    const sidecars = ['P/IMG_2.HEIC.supplemental-metadata.json', 'P/IMG_3.JPG.supplemental-metadata.json', 'P/IMG_4.JPG.supplemental-metadata(1).json']
    const pairs = matchTakeoutSidecars(media, sidecars)
    expect(pairs.get('P/IMG_2.MP4')).toBe('P/IMG_2.HEIC.supplemental-metadata.json')
    expect(pairs.get('P/IMG_3-edited.JPG')).toBe('P/IMG_3.JPG.supplemental-metadata.json')
    expect(pairs.get('P/IMG_4(1).JPG')).toBe('P/IMG_4.JPG.supplemental-metadata(1).json')
    expect(pairs.has('P/lonely.png')).toBe(false)
  })

  it('reads the capture time in seconds, and the creation time when that is all there is', () => {
    expect(takeoutTakenAt({ photoTakenTime: { timestamp: '1560000000' } })).toBe('2019-06-08T13:20:00.000Z')
    expect(takeoutTakenAt({ creationTime: { timestamp: '1560000000' } })).toBe('2019-06-08T13:20:00.000Z')
    expect(takeoutTakenAt({ title: 'x' })).toBeNull()
    expect(takeoutTakenAt(null)).toBeNull()
  })
})

/** A zip built by hand: the entries stored or deflated, the way an archiver writes them. */
async function buildZip(files: Array<{ name: string; data: Uint8Array; deflate?: boolean }>): Promise<Blob> {
  const parts: Uint8Array[] = [], central: Uint8Array[] = []
  let offset = 0
  for (const file of files) {
    const name = new TextEncoder().encode(file.name)
    const data = file.deflate ? new Uint8Array(await new Response(new Blob([file.data]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()) : file.data
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true); local.setUint16(8, file.deflate ? 8 : 0, true)
    local.setUint32(18, data.byteLength, true); local.setUint32(22, file.data.byteLength, true); local.setUint16(26, name.byteLength, true)
    const header = new DataView(new ArrayBuffer(46))
    header.setUint32(0, 0x02014b50, true); header.setUint16(10, file.deflate ? 8 : 0, true)
    header.setUint32(20, data.byteLength, true); header.setUint32(24, file.data.byteLength, true); header.setUint16(28, name.byteLength, true); header.setUint32(42, offset, true)
    parts.push(new Uint8Array(local.buffer), name, data)
    central.push(new Uint8Array(header.buffer), name)
    offset += 30 + name.byteLength + data.byteLength
  }
  const size = central.reduce((sum, part) => sum + part.byteLength, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, size, true); end.setUint32(16, offset, true)
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)])
}

describe('Reading a zip in place', () => {
  it('lists entries and reads stored and deflated files, with UTF-8 names', async () => {
    const photo = new Uint8Array(5000).map((_, index) => index % 251)
    const zip = await buildZip([
      { name: 'Takeout/Фото/IMG_1.JPG', data: photo },
      { name: 'Takeout/Фото/IMG_1.JPG.json', data: new TextEncoder().encode('{"photoTakenTime":{"timestamp":"1"}}'), deflate: true },
    ])
    const entries = await readZipEntries(zip)
    expect(entries.map(entry => entry.path)).toEqual(['Takeout/Фото/IMG_1.JPG', 'Takeout/Фото/IMG_1.JPG.json'])
    expect(new Uint8Array(await (await zipEntryBlob(zip, entries[0]!)).arrayBuffer())).toEqual(photo)
    expect(JSON.parse(await (await zipEntryBlob(zip, entries[1]!)).text())).toEqual({ photoTakenTime: { timestamp: '1' } })
  })

  it('refuses something that is not a zip', async () => {
    await expect(readZipEntries(new Blob(['not a zip at all']))).rejects.toThrow(/not a zip/u)
  })
})
