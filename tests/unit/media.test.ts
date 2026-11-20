import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { INIT_SQL } from '../../server/utils/db'
import type { ServerMembership } from '../../server/utils/channel-access'
import { deleteMedia, knownImportKeys, listMedia, requireMediaItem, setMediaVisibility, uploadMedia } from '../../server/utils/media'
import {
  decodeMediaCursor, encodeMediaCursor, matchTakeoutSidecars, mediaImportKey, sniffMediaType, takeoutSidecarTarget, takeoutTakenAt,
} from '../../shared/media'
import { ALL_PERMISSIONS } from '../../shared/permissions'
import { DEFAULT_SPACE_ID } from '../../shared/spaces'
import { readZipEntries, zipEntryBlob } from '../../app/utils/media-zip'
import type { ZugoidEnv } from '../../workers/env'
import { d1 } from '../helpers/sqlite-d1'

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

describe('Media types and keys', () => {
  it('trusts the bytes, not the name', () => {
    const bytes = (...values: number[]) => new Uint8Array([...values, ...Array(32).fill(0)])
    const text = (value: string, at = 0) => { const out = new Uint8Array(32); [...value].forEach((char, index) => { out[at + index] = char.charCodeAt(0) }); return out }
    expect(sniffMediaType(bytes(0xFF, 0xD8, 0xFF))).toBe('image/jpeg')
    expect(sniffMediaType(bytes(0x89, 0x50, 0x4E, 0x47))).toBe('image/png')
    const ftyp = (brand: string) => { const out = text(`ftyp${brand}`, 4); return out }
    expect(sniffMediaType(ftyp('heic'))).toBe('image/heic')
    expect(sniffMediaType(ftyp('qt  '))).toBe('video/quicktime')
    expect(sniffMediaType(ftyp('isom'))).toBe('video/mp4')
    expect(sniffMediaType(text('<html><script>'))).toBeNull()
  })

  it('keys an import by name, size and capture second, and pages by capture time', () => {
    expect(mediaImportKey('IMG_1.JPG', 10, '2019-06-08T13:20:00.123Z')).toBe(mediaImportKey('img_1.jpg', 10, '2019-06-08T13:20:00.999Z'))
    expect(decodeMediaCursor(encodeMediaCursor('2019-06-08T13:20:00.000Z', 'abc'))).toEqual({ takenAt: '2019-06-08T13:20:00.000Z', id: 'abc' })
    expect(decodeMediaCursor('junk')).toBeNull()
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

describe('Media library', () => {
  const SERVER = '00000000-0000-4000-8000-000000000001'
  let sqlite: DatabaseSync
  let env: ZugoidEnv
  let files: Map<string, Uint8Array>
  const member = (id: string): ServerMembership => ({
    user: { id, kind: 'human' }, serverId: SERVER, ownerId: 'owner', isOwner: id === 'owner', perms: ALL_PERMISSIONS,
    authorization: { serverId: SERVER, principal: { id, kind: 'human' }, credential: { kind: 'session' }, spaces: { ids: [DEFAULT_SPACE_ID], active: DEFAULT_SPACE_ID, denied: {} } },
  }) as unknown as ServerMembership
  const jpeg = (size: number) => { const bytes = new Uint8Array(size); bytes.set([0xFF, 0xD8, 0xFF, 0xE0]); return bytes }
  const input = (name: string, size: number, takenAt = '2019-06-08T13:20:00.000Z') => ({ filename: name, sizeBytes: size, takenAt, takenAtSource: 'sidecar' as const, width: 4, height: 3, durationMs: null })

  beforeEach(() => {
    sqlite = new DatabaseSync(':memory:')
    sqlite.exec(INIT_SQL)
    sqlite.exec(`
      INSERT INTO roles (id, key, name, permissions_bitmask) VALUES ('member', 'member', 'Member', ${ALL_PERMISSIONS});
      INSERT INTO users (id, display_name, status, role_id, joined_at) VALUES ('owner', 'Owner', 'active', 'member', '2026-09-01T00:00:00.000Z'),
        ('polina', 'Polina', 'active', 'member', '2026-09-01T00:00:00.000Z');
      INSERT INTO server_identity(singleton,id) VALUES(1,'${SERVER}');
      INSERT INTO server(id,name,owner_id) VALUES('${SERVER}','Media test','owner');
    `)
    files = new Map()
    const stored = (key: string) => files.get(key)
    env = {
      DB: d1(sqlite),
      FILES: {
        put: async (key: string, value: Uint8Array) => { files.set(key, new Uint8Array(value)) },
        head: async (key: string) => { const bytes = stored(key); return bytes ? { size: bytes.byteLength } : null },
        get: async (key: string, options?: { range?: { offset: number; length: number } }) => {
          const bytes = stored(key)
          if (!bytes) return null
          const slice = options?.range ? bytes.slice(options.range.offset, options.range.offset + options.range.length) : bytes
          return { size: slice.byteLength, arrayBuffer: async () => slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength) }
        },
        delete: async (key: string | string[]) => { for (const one of [key].flat()) files.delete(one) },
      },
      RATE_LIMIT_DO: { getByName: () => ({ take: async () => true }) },
    } as unknown as ZugoidEnv
  })
  afterEach(() => sqlite.close())

  it('keeps an item to its owner until it is shared with the Space', async () => {
    const { item } = await uploadMedia(env, member('owner'), input('IMG_1.JPG', 40), jpeg(40), 40)
    expect(item.visibility).toBe('private')
    expect((await listMedia(env, member('owner'), 'mine')).items.map(entry => entry.id)).toEqual([item.id])
    expect((await listMedia(env, member('polina'), 'space')).items).toEqual([])
    await expect(requireMediaItem(env, member('polina'), item.id, 'read')).rejects.toMatchObject({ statusCode: 404 })

    await setMediaVisibility(env, member('owner'), item.id, 'space')
    expect((await listMedia(env, member('polina'), 'space')).items.map(entry => entry.id)).toEqual([item.id])
    await expect(requireMediaItem(env, member('polina'), item.id, 'read')).resolves.toMatchObject({ id: item.id })
    // Seeing an item is not owning it.
    await expect(setMediaVisibility(env, member('polina'), item.id, 'private')).rejects.toMatchObject({ statusCode: 404 })
    await expect(deleteMedia(env, member('polina'), item.id)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('stores the same file once and tells an import what it already has', async () => {
    const first = await uploadMedia(env, member('owner'), input('IMG_1.JPG', 40), jpeg(40), 40)
    const again = await uploadMedia(env, member('owner'), input('IMG_1.JPG', 40), jpeg(40), 40)
    expect(again).toMatchObject({ existed: true, item: { id: first.item.id } })
    expect(files.size).toBe(1)
    const key = mediaImportKey('IMG_1.JPG', 40, '2019-06-08T13:20:00.000Z')
    expect(await knownImportKeys(env, member('owner'), [key, 'other'])).toEqual([key])
    expect(await knownImportKeys(env, member('polina'), [key])).toEqual([])
  })

  it('refuses what is not a photo or a video, and keeps nothing of it', async () => {
    const html = new TextEncoder().encode('<html><script>alert(1)</script></html>')
    await expect(uploadMedia(env, member('owner'), input('x.jpg', html.byteLength), html, html.byteLength)).rejects.toMatchObject({ statusCode: 415 })
    expect(files.size).toBe(0)
  })

  it('orders the timeline by capture time and pages through it', async () => {
    for (let index = 0; index < 3; index++) await uploadMedia(env, member('owner'), input(`IMG_${index}.JPG`, 40 + index, `2019-0${index + 1}-01T00:00:00.000Z`), jpeg(40 + index), 40 + index)
    const page = await listMedia(env, member('owner'), 'mine')
    expect(page.items.map(item => item.filename)).toEqual(['IMG_2.JPG', 'IMG_1.JPG', 'IMG_0.JPG'])
    expect(page.nextCursor).toBeNull()
  })

  it('queues an item\'s file for removal with the row', async () => {
    const { item } = await uploadMedia(env, member('owner'), input('IMG_1.JPG', 40), jpeg(40), 40)
    await deleteMedia(env, member('owner'), item.id)
    expect((await listMedia(env, member('owner'), 'mine')).items).toEqual([])
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM file_deletions').get()).toEqual({ n: 1 })
  })
})
