import { test } from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import os from 'bare-os'
import barePath from 'bare-path'

import { image } from '..'
import { encodeBox, parseBoxes } from '../src/container/isobmff'
import { calculateFitDimensions } from '../src/image/dimensions'
import { isStripMetadataSupported } from '../types'
import {
  makeHttpLink,
  isAnimatedWebP,
  randomFileName,
  makeRGBA,
  makeAnimatedRGBA,
  pixelAt
} from './helpers'

const { read, decode, encode, crop, resize, slice, orientate, rotate, flip } = image

test('image read() path', async (t) => {
  const path = './test/fixtures/sample.jpg'

  const buffer = await read(path)

  t.ok(Buffer.isBuffer(buffer))
  t.alike(buffer.slice(0, 2), b4a.from([0xff, 0xd8]), 'jpeg')
})

test('image read() httpLink', async (t) => {
  const path = './test/fixtures/sample.jpg'
  const httpLink = await makeHttpLink(t, path)

  const buffer = await read(httpLink)

  t.ok(Buffer.isBuffer(buffer))
  t.alike(buffer.slice(0, 2), b4a.from([0xff, 0xd8]), 'jpeg')
})

test('image read() buffer', async (t) => {
  const path = './test/fixtures/sample.jpg'
  const buff = fs.readFileSync(path)

  const buffer = await read(buff)

  t.ok(Buffer.isBuffer(buffer))
  t.alike(buffer.slice(0, 2), b4a.from([0xff, 0xd8]), 'jpeg')
})

test('image.metadata() all entries - jpg', async (t) => {
  const path = './test/fixtures/exif-orientation.jpg'

  const metadata = await image(path).metadata()

  t.is(metadata.exif.COLOR_SPACE, 65535)
  t.is(metadata.exif.EXIF_VERSION.toString(), '0210')
  t.is(metadata.exif.FLASH_PIX_VERSION.toString(), '0100')
  t.is(metadata.exif.ORIENTATION, 6)
  t.is(metadata.exif.RESOLUTION_UNIT, 1)
  t.alike(metadata.exif.X_RESOLUTION, { numerator: 1, denominator: 1 })
  t.alike(metadata.exif.Y_RESOLUTION, { numerator: 1, denominator: 1 })
  t.is(metadata.exif.YCBCR_POSITIONING, 1)
  t.is(metadata.orientation, 6)
})

test('image.metadata() single entry - jpg', async (t) => {
  const path = './test/fixtures/exif-orientation.jpg'

  const orientation = await image(path).metadata({ tag: 'orientation' })

  t.is(orientation, 6)
})

test('image.metadata() all entries - heic', async (t) => {
  const path = './test/fixtures/exif-orientation.heic'

  const metadata = await image(path).metadata()

  t.is(metadata.exif.COLOR_SPACE, 65535)
  t.is(metadata.exif.EXIF_VERSION.toString(), '0210')
  t.is(metadata.exif.FLASH_PIX_VERSION.toString(), '0100')
  t.is(metadata.exif.MAKE, 'bare-media')
  t.is(metadata.exif.ARTIST, 'bare-media')
  t.is(metadata.exif.ORIENTATION, 6)
  t.is(metadata.exif.RESOLUTION_UNIT, 2)
  t.alike(metadata.exif.X_RESOLUTION, { numerator: 72, denominator: 1 })
  t.alike(metadata.exif.Y_RESOLUTION, { numerator: 72, denominator: 1 })
  t.is(metadata.orientation, 6)
})

test('image.metadata() single entry - heic', async (t) => {
  const path = './test/fixtures/exif-orientation.heic'

  const orientation = await image(path).metadata({ tag: 'orientation' })

  t.is(orientation, 6)
})

test('image.metadata() all entries - avif', async (t) => {
  const path = './test/fixtures/exif-orientation.avif'

  const metadata = await image(path).metadata()

  t.is(metadata.exif.COLOR_SPACE, 65535)
  t.is(metadata.exif.EXIF_VERSION.toString(), '0210')
  t.is(metadata.exif.FLASH_PIX_VERSION.toString(), '0100')
  t.is(metadata.exif.MAKE, 'bare-media')
  t.is(metadata.exif.ARTIST, 'bare-media')
  t.is(metadata.exif.ORIENTATION, 6)
  t.is(metadata.exif.RESOLUTION_UNIT, 2)
  t.alike(metadata.exif.X_RESOLUTION, { numerator: 72, denominator: 1 })
  t.alike(metadata.exif.Y_RESOLUTION, { numerator: 72, denominator: 1 })
  t.is(metadata.orientation, 6)
})

test('image.metadata() single entry - avif', async (t) => {
  const path = './test/fixtures/exif-orientation.avif'

  const orientation = await image(path).metadata({ tag: 'orientation' })

  t.is(orientation, 6)
})

test('image.metadata() xmp - heic', async (t) => {
  const path = './test/fixtures/metadata-xmp.heic'

  const metadata = await image(path).metadata()

  t.ok(metadata.xmp.includes('<x:xmpmeta'), 'xmp packet')
  t.ok(metadata.xmp.includes('<dc:creator>'), 'xmp entries')
  t.is(metadata.exif.ORIENTATION, 1, 'still reads the exif item')
  t.absent(metadata.mime, 'xmp is not repeated as a mime item')
  t.absent(metadata.uri)
})

test('image.metadata() single entry filters HEIF metadata blocks', async (t) => {
  const path = './test/fixtures/metadata-xmp.heic'

  const orientation = await image(path).metadata({ tag: 'orientation' })

  t.is(orientation, 1)
})

test('image.metadata() xmp - avif', async (t) => {
  const path = './test/fixtures/metadata-xmp.avif'

  const metadata = await image(path).metadata()

  t.ok(metadata.xmp.includes('<x:xmpmeta'), 'xmp packet')
  t.ok(metadata.xmp.includes('<dc:creator>'), 'xmp entries')
  t.absent(metadata.mime)
  t.absent(metadata.uri)
})

test('image.metadata() uri - heic', async (t) => {
  const path = './test/fixtures/metadata-uri.heic'

  const metadata = await image(path).metadata()

  t.is(metadata.uri.length, 1)
  t.is(metadata.uri[0].uriType, 'https://example.com/bare-media/test')
  t.ok(metadata.uri[0].data.includes('bare-media uri metadata fixture'))
  t.alike(metadata.exif, {})
  t.absent(metadata.xmp)
})

test('image.metadata() no metadata - avif', async (t) => {
  const path = './test/fixtures/sample.avif'

  const metadata = await image(path).metadata()

  t.alike(metadata, { exif: {} })
  t.is(await image(path).metadata({ tag: 'orientation' }), null)
})

test('image.metadata.strip() strips all metadata', async (t) => {
  const path = './test/fixtures/exif-orientation.jpg'

  const metadata = await image(path).metadata()

  t.ok(metadata.exif.COLOR_SPACE)
  t.ok(metadata.exif.EXIF_VERSION)
  t.ok(metadata.exif.FLASH_PIX_VERSION)
  t.ok(metadata.exif.ORIENTATION)
  t.ok(metadata.exif.RESOLUTION_UNIT)
  t.is(metadata.orientation, 6)

  const newImage = await image(path).metadata.strip()

  {
    const metadata = await image(newImage).metadata()

    // no exif data is stored
    t.absent(metadata.exif.COLOR_SPACE)
    t.absent(metadata.exif.EXIF_VERSION)
    t.absent(metadata.exif.FLASH_PIX_VERSION)
    t.absent(metadata.exif.ORIENTATION)
    t.absent(metadata.exif.RESOLUTION_UNIT)
    t.absent(metadata.orientation, 6)
  }
})

test('image.metadata.strip() strips all metadata, except orientation', async (t) => {
  const path = './test/fixtures/exif.jpg'

  const metadata = await image(path).metadata()

  t.ok(metadata.exif.COLOR_SPACE)
  t.ok(metadata.exif.EXIF_VERSION)
  t.ok(metadata.exif.FLASH_PIX_VERSION)
  t.ok(metadata.exif.RESOLUTION_UNIT)
  t.ok(metadata.exif.MAKE)
  t.ok(metadata.exif.LENS_MAKE)
  t.ok(metadata.exif.ARTIST)
  t.ok(metadata.exif.ORIENTATION)
  t.is(metadata.orientation, 6)

  const newImage = await image(path).metadata.strip({ keepOrientation: true })

  {
    const metadata = await image(newImage).metadata()

    // some mandatory tags remain as for the spec
    t.ok(metadata.exif.COLOR_SPACE)
    t.ok(metadata.exif.EXIF_VERSION)
    t.ok(metadata.exif.FLASH_PIX_VERSION)
    t.ok(metadata.exif.RESOLUTION_UNIT)
    t.absent(metadata.exif.MAKE)
    t.absent(metadata.exif.LENS_MAKE)
    t.absent(metadata.exif.ARTIST)
    t.ok(metadata.exif.ORIENTATION)
    t.is(metadata.orientation, 6)
  }
})

test('image.metadata.strip().save() strips all metadata and saves the file', async (t) => {
  const path = './test/fixtures/exif-orientation.jpg'
  const outPath = barePath.join(os.tmpdir(), randomFileName('jpg'))

  const metadata = await image(path).metadata()

  t.ok(metadata.exif.COLOR_SPACE)
  t.ok(metadata.exif.EXIF_VERSION)
  t.ok(metadata.exif.FLASH_PIX_VERSION)
  t.ok(metadata.exif.ORIENTATION)
  t.ok(metadata.exif.RESOLUTION_UNIT)
  t.is(metadata.orientation, 6)

  await image(path).metadata.strip().save(outPath)

  {
    const metadata = await image(outPath).metadata()
    t.absent(metadata.exif.COLOR_SPACE)
    t.absent(metadata.exif.EXIF_VERSION)
    t.absent(metadata.exif.FLASH_PIX_VERSION)
    t.absent(metadata.exif.ORIENTATION)
    t.absent(metadata.exif.RESOLUTION_UNIT)
    t.absent(metadata.orientation, 6)
  }

  t.teardown(() => {
    fs.rm(outPath, { force: true })
  })
})

test('image.metadata.strip() strips HEIC metadata', async (t) => {
  const stripped = await image('./test/fixtures/metadata-xmp.heic').metadata.strip()

  t.alike(await image.metadata(stripped), { exif: {} })
  t.absent(stripped.includes('<x:xmpmeta'))
})

test('image.metadata.strip() strips AVIF metadata', async (t) => {
  const stripped = await image('./test/fixtures/metadata-xmp.avif').metadata.strip()

  t.alike(await image.metadata(stripped), { exif: {} })
  t.absent(stripped.includes('<x:xmpmeta'))
})

test(`image.metadata.strip() keeps Exif orientation - heic`, async (t) => {
  const source = fs.readFileSync('./test/fixtures/exif-orientation.heic')
  const stripped = await image(source).metadata.strip({ keepOrientation: true })
  const metadata = await image.metadata(stripped)

  t.absent(metadata.exif.MAKE)
  t.absent(metadata.exif.ARTIST)
  t.is(metadata.orientation, 6)
})

test(`image.metadata.strip() keeps Exif orientation - avif`, async (t) => {
  const source = fs.readFileSync('./test/fixtures/exif-orientation.avif')
  const stripped = await image(source).metadata.strip({ keepOrientation: true })
  const metadata = await image.metadata(stripped)

  t.absent(metadata.exif.MAKE)
  t.absent(metadata.exif.ARTIST)
  t.is(metadata.orientation, 6)
})

test(`image.metadata.strip() removes Exif without orientation - jpg`, async (t) => {
  const source = fs.readFileSync('./test/fixtures/exif-no-orientation.jpg')

  t.absent(await image.metadata(source, { tag: 'orientation' }))
  t.ok(source.includes('Exif'))

  const stripped = await image(source).metadata.strip({ keepOrientation: true })

  t.alike(await image.metadata(stripped), { exif: {} })
  t.absent(stripped.includes('Exif'), 'removes the Exif item or marker')
})

test(`image.metadata.strip() removes Exif without orientation - heic`, async (t) => {
  const source = fs.readFileSync('./test/fixtures/exif-no-orientation.heic')

  t.absent(await image.metadata(source, { tag: 'orientation' }))
  t.ok(source.includes('Exif'))

  const stripped = await image(source).metadata.strip({ keepOrientation: true })

  t.alike(await image.metadata(stripped), { exif: {} })
  t.absent(stripped.includes('Exif'), 'removes the Exif item or marker')
})

test(`image.metadata.strip() removes Exif without orientation - avif`, async (t) => {
  const source = fs.readFileSync('./test/fixtures/exif-no-orientation.avif')

  t.absent(await image.metadata(source, { tag: 'orientation' }))
  t.ok(source.includes('Exif'))

  const stripped = await image(source).metadata.strip({ keepOrientation: true })

  t.alike(await image.metadata(stripped), { exif: {} })
  t.absent(stripped.includes('Exif'), 'removes the Exif item or marker')
})

test('image.metadata.strip() keeps orientation while removing XMP', async (t) => {
  const stripped = await image('./test/fixtures/metadata-xmp.heic').metadata.strip({
    keepOrientation: true
  })
  t.is(await image.metadata(stripped, { tag: 'orientation' }), 1)
  t.absent(stripped.includes('<x:xmpmeta'))
})

test('image.metadata.strip() rejects an Exif replacement larger than its storage', async (t) => {
  const source = await image('./test/fixtures/exif-orientation.heic').metadata.strip({
    keepOrientation: true
  })
  source.writeUInt32BE(26, source.indexOf('iloc') + 36)
  await t.exception(
    () => image(source).metadata.strip({ keepOrientation: true }),
    /does not fit its original storage/
  )
})

test('image.metadata.strip() with keepOrientation and no Exif item', async (t) => {
  const stripped = await image('./test/fixtures/metadata-uri.heic').metadata.strip({
    keepOrientation: true
  })
  t.alike(await image.metadata(stripped), { exif: {} })
})

test('image.metadata.strip() rejects HEIC without a meta box', async (t) => {
  const missingMeta = fs.readFileSync('./test/fixtures/metadata-xmp.heic')
  missingMeta.write('free', missingMeta.indexOf('meta'))
  await t.exception(() => image(missingMeta).metadata.strip(), /Invalid HEIF metadata container/)
})

test('image.metadata.strip() rejects HEIC with an invalid meta box size', async (t) => {
  const invalidBox = fs.readFileSync('./test/fixtures/metadata-xmp.heic')
  invalidBox.writeUInt32BE(4, invalidBox.indexOf('meta') - 4)
  await t.exception(() => image(invalidBox).metadata.strip(), /Invalid ISO-BMFF meta box size/)
})

test('image.metadata.strip() rejects HEIC metadata without an iloc box', async (t) => {
  const missingLocation = fs.readFileSync('./test/fixtures/metadata-xmp.heic')
  missingLocation.write('free', missingLocation.indexOf('iloc'))
  await t.exception(() => image(missingLocation).metadata.strip(), /Missing HEIF item location box/)
})

test('image.metadata.strip() rejects HEIC metadata without an item location', async (t) => {
  const missingItemLocation = fs.readFileSync('./test/fixtures/metadata-xmp.heic')
  const iloc = missingItemLocation.indexOf('iloc')
  missingItemLocation.writeUInt16BE(99, iloc + 40) // Replace the XMP item's ID in iloc.
  await t.exception(
    () => image(missingItemLocation).metadata.strip(),
    /Missing HEIF item location for metadata item 3/
  )
})

test('image.metadata.strip() rejects a primary HEIC metadata item', async (t) => {
  const primaryMetadata = fs.readFileSync('./test/fixtures/metadata-xmp.heic')
  primaryMetadata.writeUInt16BE(2, primaryMetadata.indexOf('pitm') + 8)
  await t.exception(
    () => image(primaryMetadata).metadata.strip(),
    /Cannot remove the primary HEIF item/
  )
})

test('image.metadata.strip() rejects an unsupported HEIC item location version', async (t) => {
  const unsupportedLocation = fs.readFileSync('./test/fixtures/metadata-xmp.heic')
  unsupportedLocation[unsupportedLocation.indexOf('iloc') + 4] = 3
  await t.exception(
    () => image(unsupportedLocation).metadata.strip(),
    /Unsupported HEIF item location version/
  )
})

test('image.metadata.strip() rejects HEIC metadata sharing image storage', async (t) => {
  const sharedStorage = fs.readFileSync('./test/fixtures/metadata-xmp.heic')
  const iloc = sharedStorage.indexOf('iloc')
  sharedStorage.writeUInt32BE(sharedStorage.readUInt32BE(iloc + 18), iloc + 32)
  await t.exception(
    () => image(sharedStorage).metadata.strip(),
    /HEIF metadata shares storage with a retained item/
  )
})

test('image.metadata.strip() rejects HEIC metadata outside a media data box', async (t) => {
  const outsideMdat = fs.readFileSync('./test/fixtures/metadata-xmp.heic')
  outsideMdat.writeUInt32BE(8, outsideMdat.indexOf('iloc') + 32)
  await t.exception(
    () => image(outsideMdat).metadata.strip(),
    /HEIF metadata is stored outside a media data box/
  )
})

test('image.metadata.strip() strips HEIC with an implicit item extent length', async (t) => {
  const implicitLength = fs.readFileSync('./test/fixtures/metadata-xmp.heic')
  implicitLength.writeUInt32BE(0, implicitLength.indexOf('iloc') + 22) // Primary item runs to EOF.
  const stripped = await image(implicitLength).metadata.strip()

  t.absent(stripped.includes('<x:xmpmeta'))
})

test('image.metadata.strip() rejects HEIC with an implicit extent past the end', async (t) => {
  const pastEnd = fs.readFileSync('./test/fixtures/metadata-xmp.heic')
  const iloc = pastEnd.indexOf('iloc')
  pastEnd.writeUInt32BE(pastEnd.byteLength + 1, iloc + 18)
  pastEnd.writeUInt32BE(0, iloc + 22)
  await t.exception(() => image(pastEnd).metadata.strip(), /Invalid HEIF item data location/)
})

test('image.metadata.strip() rejects HEIC with zero-byte iloc extents', async (t) => {
  const zeroByteExtents = fs.readFileSync('./test/fixtures/metadata-xmp.heic')
  const iloc = zeroByteExtents.indexOf('iloc')
  zeroByteExtents[iloc + 8] = 0 // Offset and length fields have zero width
  zeroByteExtents.writeUInt16BE(0xffff, iloc + 16) // First item declares many extents

  await t.exception(() => image(zeroByteExtents).metadata.strip(), /Invalid HEIF item location box/)
})

test('image.metadata.strip() rejects HEIC with too many item extents', async (t) => {
  const entry = encodeBox('infe', Buffer.from([2, 0, 0, 0, 0, 1, 0, 0, 69, 120, 105, 102, 0]))
  const iinf = encodeBox('iinf', Buffer.concat([Buffer.alloc(4), Buffer.from([0, 1]), entry]))
  const location = Buffer.alloc(14 + 4097 * 8)
  location[4] = 0x44
  location.writeUInt16BE(1, 6)
  location.writeUInt16BE(1, 8)
  location.writeUInt16BE(4097, 12)
  const iloc = encodeBox('iloc', location)
  const meta = encodeBox('meta', Buffer.concat([Buffer.alloc(4), iinf, iloc]))
  const ftyp = encodeBox('ftyp', Buffer.from('heic\x00\x00\x00\x00heicmif1', 'latin1'))

  await t.exception(
    () => image.metadata.strip(Buffer.concat([ftyp, meta])),
    /Invalid HEIF item location box/
  )
})

test('image.metadata.strip() rejects HEIC with a non-standard iloc field width', async (t) => {
  const entry = encodeBox('infe', Buffer.from([2, 0, 0, 0, 0, 1, 0, 0, 69, 120, 105, 102, 0]))
  const iinf = encodeBox('iinf', Buffer.concat([Buffer.alloc(4), Buffer.from([0, 1]), entry]))
  const location = Buffer.alloc(6)
  location[4] = 0x24 // offset_size = 2, length_size = 4 (2 is not 0, 4 or 8)
  const iloc = encodeBox('iloc', location)
  const meta = encodeBox('meta', Buffer.concat([Buffer.alloc(4), iinf, iloc]))
  const ftyp = encodeBox('ftyp', Buffer.from('heic\x00\x00\x00\x00heicmif1', 'latin1'))

  await t.exception(
    () => image.metadata.strip(Buffer.concat([ftyp, meta])),
    /Invalid HEIF item location box/
  )
})

test('image.metadata.strip() rejects HEIC with too many item location entries', async (t) => {
  const entry = encodeBox('infe', Buffer.from([2, 0, 0, 0, 0, 1, 0, 0, 69, 120, 105, 102, 0]))
  const iinf = encodeBox('iinf', Buffer.concat([Buffer.alloc(4), Buffer.from([0, 1]), entry]))
  const location = Buffer.alloc(10)
  location[0] = 2 // version
  location[4] = 0x44
  location.writeUInt32BE(4097, 6) // item count
  const iloc = encodeBox('iloc', location)
  const meta = encodeBox('meta', Buffer.concat([Buffer.alloc(4), iinf, iloc]))
  const ftyp = encodeBox('ftyp', Buffer.from('heic\x00\x00\x00\x00heicmif1', 'latin1'))

  await t.exception(
    () => image.metadata.strip(Buffer.concat([ftyp, meta])),
    /Invalid HEIF item location box/
  )
})

test('image.metadata.strip() rejects HEIC with too many property associations', async (t) => {
  const entry = encodeBox('infe', Buffer.from([2, 0, 0, 0, 0, 1, 0, 0, 69, 120, 105, 102, 0]))
  const iinf = encodeBox('iinf', Buffer.concat([Buffer.alloc(4), Buffer.from([0, 1]), entry]))

  const location = Buffer.alloc(14 + 8) // one item, one extent
  location[4] = 0x44
  location.writeUInt16BE(1, 6) // item count
  location.writeUInt16BE(1, 8) // item ID
  location.writeUInt16BE(1, 12) // extent count
  location.writeUInt32BE(4, 18) // extent length

  const ipmaPayload = Buffer.alloc(8 + 4097 * 3)
  ipmaPayload.writeUInt32BE(4097, 4) // entry count
  const ipma = encodeBox('ipma', ipmaPayload)
  const iprp = encodeBox('iprp', ipma)

  const ftyp = encodeBox('ftyp', Buffer.from('heic\x00\x00\x00\x00heicmif1', 'latin1'))
  const metaLen = 8 + 4 + iinf.byteLength + (8 + location.byteLength) + iprp.byteLength
  location.writeUInt32BE(ftyp.byteLength + metaLen + 8, 14) // extent offset: start of mdat's payload

  const iloc = encodeBox('iloc', location)
  const meta = encodeBox('meta', Buffer.concat([Buffer.alloc(4), iinf, iloc, iprp]))
  const mdat = encodeBox('mdat', Buffer.alloc(4))

  await t.exception(
    () => image.metadata.strip(Buffer.concat([ftyp, meta, mdat])),
    /Invalid HEIF property association box/
  )
})

test('image.metadata.strip() rejects duplicate HEIC item information boxes', async (t) => {
  const source = fs.readFileSync('./test/fixtures/metadata-xmp.heic')
  const meta = parseBoxes(source).find((box) => box.type === 'meta')
  const duplicate = encodeBox('iinf', Buffer.from([0, 0, 0, 0, 0, 0]))
  const input = Buffer.concat([source.subarray(0, meta.end), duplicate, source.subarray(meta.end)])
  input.writeUInt32BE(meta.size + duplicate.length, meta.start)

  await t.exception(() => image.metadata.strip(input), /Invalid HEIF item information/)
})

test('image.metadata.strip() rejects too many Samsung sefd boxes', async (t) => {
  const directory = Buffer.alloc(20)
  directory.write('SEFH', 0, 'latin1') // directory signature
  directory.writeUInt32LE(0, 8) // entry count
  directory.writeUInt32LE(12, 12) // directory size (in the footer)
  directory.write('SEFT', 16, 'latin1') // trailer signature
  const sefd = encodeBox('sefd', directory)

  const ftyp = encodeBox('ftyp', Buffer.from('heic\x00\x00\x00\x00heicmif1', 'latin1'))
  const input = Buffer.concat([ftyp, ...Array(17).fill(sefd)])

  await t.exception(() => image.metadata.strip(input), /Too many HEIF vendor metadata boxes/)
})

test('isStripMetadataSupported() agrees with strip()', async (t) => {
  const formats = ['avif', 'bmp', 'gif', 'heic', 'ico', 'jpg', 'png', 'svg', 'tiff', 'webp']

  for (const format of formats) {
    const mimetype = `image/${format}`
    const supported = isStripMetadataSupported(mimetype)

    let threw = false
    try {
      await image(`./test/fixtures/sample.${format}`).metadata.strip()
    } catch {
      threw = true
    }

    t.is(
      threw,
      !supported,
      `isStripMetadataSupported() match with strip() support for ${mimetype} ${supported ? '✔' : '⨯'}`
    )
  }
})

test('image decode() avif', async (t) => {
  const path = './test/fixtures/sample.avif'

  const buffer = await read(path)
  const rgba = await decode(buffer)

  t.ok(Buffer.isBuffer(rgba.data))
  t.is(rgba.width, 128)
  t.is(rgba.height, 128)
})

test('image decode() bmp', async (t) => {
  const path = './test/fixtures/sample.bmp'

  const buffer = await read(path)
  const rgba = await decode(buffer)

  t.ok(Buffer.isBuffer(rgba.data))
  t.is(rgba.width, 2)
  t.is(rgba.height, 2)
})

test('image decode() ico', async (t) => {
  const path = './test/fixtures/sample.ico'

  const buffer = await read(path)
  const rgba = await decode(buffer)

  t.ok(Buffer.isBuffer(rgba.data))
  t.is(rgba.width, 256)
  t.is(rgba.height, 256)
})

test('image decode() svg', async (t) => {
  const path = './test/fixtures/sample.svg'

  const buffer = await read(path)
  const rgba = await decode(buffer)

  t.ok(Buffer.isBuffer(rgba.data))
  t.is(rgba.width, 24)
  t.is(rgba.height, 25)
})

test('image decode() gif', async (t) => {
  const path = './test/fixtures/sample.gif'

  const buffer = await read(path)
  const rgba = await decode(buffer)

  t.ok(Array.isArray(rgba.frames))
  t.is(rgba.frames.length, 44)
  t.is(rgba.width, 400)
  t.is(rgba.height, 400)
})

test('image decode() heic', async (t) => {
  const path = './test/fixtures/sample.heic'

  const buffer = await read(path)
  const rgba = await decode(buffer)

  t.ok(Buffer.isBuffer(rgba.data))
  t.is(rgba.width, 150)
  t.is(rgba.height, 120)
})

test('image decode() jpeg', async (t) => {
  const path = './test/fixtures/sample.jpg'

  const buffer = await read(path)
  const rgba = await decode(buffer)

  t.ok(Buffer.isBuffer(rgba.data))
  t.is(rgba.width, 150)
  t.is(rgba.height, 120)
})

test('image decode() png', async (t) => {
  const path = './test/fixtures/sample.png'

  const buffer = await read(path)
  const rgba = await decode(buffer)

  t.ok(Buffer.isBuffer(rgba.data))
  t.is(rgba.width, 150)
  t.is(rgba.height, 120)
})

test('image decode() tiff', async (t) => {
  const path = './test/fixtures/sample.tiff'

  const buffer = await read(path)
  const rgba = await decode(buffer)

  t.ok(Buffer.isBuffer(rgba.data))
  t.is(rgba.width, 75)
  t.is(rgba.height, 50)
})

test('image decode() webp', async (t) => {
  const path = './test/fixtures/sample.webp'

  const buffer = await read(path)
  const rgba = await decode(buffer)

  t.ok(Array.isArray(rgba.frames))
  t.is(rgba.frames.length, 1)
  t.is(rgba.width, 150)
  t.is(rgba.height, 120)
})

test('image decode() webp (animated)', async (t) => {
  const path = './test/fixtures/animated.webp'

  const buffer = await read(path)
  const rgba = await decode(buffer)

  t.ok(Array.isArray(rgba.frames))
  t.is(rgba.frames.length, 12)
  t.is(rgba.loops, 0)
  t.is(rgba.width, 476)
  t.is(rgba.height, 280)
})

test('image decode() with wrong file extension', async (t) => {
  const path = './test/fixtures/wrong-extension.jpg'

  const buffer = await read(path)
  const rgba = await decode(buffer)

  t.ok(Buffer.isBuffer(rgba.data))
  t.is(rgba.width, 150)
  t.is(rgba.height, 120)
})

test('image decode() gif with maxFrames', async (t) => {
  const path = './test/fixtures/sample.gif'

  const buffer = await read(path)
  const rgba = await decode(buffer, { maxFrames: 3 })

  t.ok(Array.isArray(rgba.frames))
  t.is(rgba.frames.length, 3)
  t.is(rgba.width, 400)
  t.is(rgba.height, 400)
})

test('image decode() webp with maxFrames', async (t) => {
  const path = './test/fixtures/animated.webp'

  const buffer = await read(path)
  const rgba = await decode(buffer, { maxFrames: 3 })

  t.ok(Array.isArray(rgba.frames))
  t.is(rgba.frames.length, 3)
  t.is(rgba.loops, 0)
  t.is(rgba.width, 476)
  t.is(rgba.height, 280)
})

test('image encode() gif throws (not implemented)', async (t) => {
  const path = './test/fixtures/sample.gif'

  const buffer = await read(path)
  const rgba = await decode(buffer)

  await t.exception(async () => {
    try {
      await encode(rgba, { mimetype: 'image/gif' })
    } catch (e) {
      throw new Error('Not implemented')
    }
  })
})

test('image encode() heic', async (t) => {
  const path = './test/fixtures/sample.heic'

  const buffer = await read(path)
  const rgba = await decode(buffer)

  await t.exception(async () => {
    try {
      await encode(rgba, { mimetype: 'image/heic' })
    } catch (e) {
      throw new Error('Not implemented')
    }
  })
})

test('image encode() jpeg', async (t) => {
  const path = './test/fixtures/sample.jpg'

  const buffer = await read(path)
  const rgba = await decode(buffer)
  const encoded = await encode(rgba, { mimetype: 'image/jpeg' })

  t.ok(Buffer.isBuffer(encoded))
})

test('image encode() png', async (t) => {
  const path = './test/fixtures/sample.png'

  const buffer = await read(path)
  const rgba = await decode(buffer)
  const encoded = await encode(rgba, { mimetype: 'image/png' })

  t.ok(Buffer.isBuffer(encoded))
})

test('image encode() tiff', async (t) => {
  const path = './test/fixtures/sample.tiff'

  const buffer = await read(path)
  const rgba = await decode(buffer)
  const encoded = await encode(rgba, { mimetype: 'image/tiff' })

  t.ok(Buffer.isBuffer(encoded))
})

test('image encode() webp', async (t) => {
  const path = './test/fixtures/sample.webp'

  const buffer = await read(path)
  const rgba = await decode(buffer)
  const encoded = await encode(rgba, { mimetype: 'image/webp' })

  t.ok(Buffer.isBuffer(encoded))
})

test('image encode() with maxBytes (reducing quality)', async (t) => {
  const path = './test/fixtures/sample.jpg'

  const buffer = await read(path)
  const rgba = await decode(buffer)
  const encoded = await encode(rgba, { mimetype: 'image/jpeg', maxBytes: 3000 })

  t.ok(Buffer.isBuffer(encoded))
  t.ok(encoded.byteLength < 3000)
})

test('image encode() with maxBytes (reducing fps)', async (t) => {
  const path = './test/fixtures/animated.webp'

  const buffer = await read(path)
  const rgba = await decode(buffer)
  const encoded = await encode(rgba, { mimetype: 'image/webp', maxBytes: 40000 })

  t.ok(Buffer.isBuffer(encoded))
  t.ok(encoded.byteLength < 40000)
  t.ok((await decode(encoded)).frames.length < rgba.frames.length)
})

test("image encode() with maxBytes throws if bytes can't fit", async (t) => {
  const path = './test/fixtures/sample.jpg'

  await t.exception(async () => {
    const buffer = await read(path)
    const rgba = await decode(buffer)
    const encoded = await encode(rgba, { mimetype: 'image/jpeg', maxBytes: 10 })
  })
})

test('image crop()', async (t) => {
  const path = './test/fixtures/sample.jpg'

  const buffer = await read(path)
  const rgba = await decode(buffer)
  const cropped = await crop(rgba, {
    left: 75,
    top: 15,
    width: 50,
    height: 50
  })

  t.is(cropped.data.length, 10000)
  t.is(cropped.width, 50)
  t.is(cropped.height, 50)
})

test('image crop() animated', async (t) => {
  const animated = makeAnimatedRGBA()

  const cropped = await crop(animated, {
    left: 1,
    top: 0,
    width: 1,
    height: 2
  })

  t.ok(Array.isArray(cropped.frames))
  t.is(cropped.frames.length, 2)
  t.is(cropped.loops, animated.loops)
  t.is(cropped.width, 1)
  t.is(cropped.height, 2)
  t.is(cropped.frames[0].timestamp, 10)
  t.is(cropped.frames[1].timestamp, 20)

  for (const frame of cropped.frames) {
    t.alike(pixelAt(frame, 0, 0), [0, 255, 0, 255])
    t.alike(pixelAt(frame, 0, 1), [255, 255, 0, 255])
  }
})

test('image crop() throws if the rectangle is out of bounds', async (t) => {
  const path = './test/fixtures/sample.jpg'

  const buffer = await read(path)
  const rgba = await decode(buffer)

  await t.exception(async () => {
    await crop(rgba, {
      left: -1,
      top: 15,
      width: 50,
      height: 50
    })
  })
  await t.exception(async () => {
    await crop(rgba, {
      left: 75,
      top: -1,
      width: 50,
      height: 50
    })
  })
  await t.exception(async () => {
    await crop(rgba, {
      left: 75,
      top: 15,
      width: 76,
      height: 50
    })
  })
  await t.exception(async () => {
    await crop(rgba, {
      left: 75,
      top: 15,
      width: 50,
      height: 106
    })
  })
})

test('image crop() throws if the rectangle coordinates are not integers', async (t) => {
  const path = './test/fixtures/sample.jpg'

  const buffer = await read(path)
  const rgba = await decode(buffer)

  await t.exception(async () => {
    await crop(rgba, {
      left: -10,
      top: 10,
      width: 50,
      height: 50
    })
  })
  await t.exception(async () => {
    await crop(rgba, {
      left: 10,
      top: -10,
      width: 50,
      height: 50
    })
  })
  await t.exception(async () => {
    await crop(rgba, {
      left: 10,
      top: 10,
      width: -50,
      height: 50
    })
  })
  await t.exception(async () => {
    await crop(rgba, {
      left: 10,
      top: 10,
      width: 50,
      height: -50
    })
  })
})

test('image resize()', async (t) => {
  const path = './test/fixtures/sample.jpg'

  const buffer = await read(path)
  const rgba = await decode(buffer)
  const resized = await resize(rgba, {
    maxWidth: 50,
    maxHeight: 50
  })

  t.is(resized.data.length, 8000)
  t.is(resized.width, 50)
  t.is(resized.height, 40)
})

test('image slice()', async (t) => {
  const path = './test/fixtures/animated.webp'

  const buffer = await read(path)
  const rgba = await decode(buffer)
  const sliced = await slice(rgba, {
    start: 4,
    end: 8
  })

  t.is(sliced.frames.length, 4)
})

test('image slice() no start', async (t) => {
  const path = './test/fixtures/animated.webp'

  const buffer = await read(path)
  const rgba = await decode(buffer)
  const sliced = await slice(rgba, {
    end: 8
  })

  t.is(sliced.frames.length, 8)
})

test('image slice() no end', async (t) => {
  const path = './test/fixtures/animated.webp'

  const buffer = await read(path)
  const rgba = await decode(buffer)
  const sliced = await slice(rgba, {
    start: 4
  })

  t.is(sliced.frames.length, 8)
})

test('image slice() throws if start > end', async (t) => {
  const path = './test/fixtures/animated.webp'

  const buffer = await read(path)
  const rgba = await decode(buffer)

  await t.exception(async () => {
    const sliced = await slice(rgba, {
      start: 4,
      end: 2
    })
  })
})

test('image orientate() reading EXIF metadata', async (t) => {
  const path = './test/fixtures/exif-orientation.jpg'

  const buffer = await read(path)
  const rgba = await decode(buffer)
  const rgbaO = await orientate(rgba, { file: buffer })

  t.ok(Buffer.isBuffer(rgba.data))
  t.is(rgba.width, 120)
  t.is(rgba.height, 150)

  t.ok(Buffer.isBuffer(rgbaO.data))
  t.is(rgbaO.width, 150)
  t.is(rgbaO.height, 120)
})

test('image orientate() without EXIF orientation', async (t) => {
  const path = './test/fixtures/exif-empty.jpg'

  const buffer = await read(path)
  const rgba = await decode(buffer)
  const rgbaO = await orientate(rgba, { file: buffer })

  t.ok(Buffer.isBuffer(rgba.data))
  t.ok(Buffer.isBuffer(rgbaO.data))
  t.is(rgba.width, rgbaO.width)
  t.is(rgba.height, rgbaO.height)
})

test('image orientate() EXIF values 1..8', async (t) => {
  const rgba = makeRGBA()

  const expected = {
    1: [
      [255, 0, 0, 255],
      [0, 255, 0, 255],
      [0, 0, 255, 255],
      [255, 255, 0, 255]
    ],
    2: [
      [0, 255, 0, 255],
      [255, 0, 0, 255],
      [255, 255, 0, 255],
      [0, 0, 255, 255]
    ],
    3: [
      [255, 255, 0, 255],
      [0, 0, 255, 255],
      [0, 255, 0, 255],
      [255, 0, 0, 255]
    ],
    4: [
      [0, 0, 255, 255],
      [255, 255, 0, 255],
      [255, 0, 0, 255],
      [0, 255, 0, 255]
    ],
    5: [
      [255, 0, 0, 255],
      [0, 0, 255, 255],
      [0, 255, 0, 255],
      [255, 255, 0, 255]
    ],
    6: [
      [0, 0, 255, 255],
      [255, 0, 0, 255],
      [255, 255, 0, 255],
      [0, 255, 0, 255]
    ],
    7: [
      [255, 255, 0, 255],
      [0, 255, 0, 255],
      [0, 0, 255, 255],
      [255, 0, 0, 255]
    ],
    8: [
      [0, 255, 0, 255],
      [255, 255, 0, 255],
      [255, 0, 0, 255],
      [0, 0, 255, 255]
    ]
  }

  for (let exif = 1; exif <= 8; exif++) {
    const transformed = await orientate(rgba, { exif })

    t.alike(
      [
        pixelAt(transformed, 0, 0),
        pixelAt(transformed, 1, 0),
        pixelAt(transformed, 0, 1),
        pixelAt(transformed, 1, 1)
      ],
      expected[exif],
      `exif orientation ${exif}`
    )
  }
})

test('image orientate() unknown exif values do nothing (and do not throw)', async (t) => {
  const rgba = makeRGBA()

  const exif0 = await orientate(rgba, { exif: 0 })
  const exif9 = await orientate(rgba, { exif: 9 })

  t.is(exif0.width, rgba.width)
  t.is(exif0.height, rgba.height)
  t.alike(exif0.data, rgba.data)

  t.is(exif9.width, rgba.width)
  t.is(exif9.height, rgba.height)
  t.alike(exif9.data, rgba.data)
})

test('image orientate() with "transform"', async (t) => {
  const rgba = makeRGBA()

  const transformed = await orientate(rgba, {
    transform: { rotate: 90, flipH: true, flipV: false }
  })

  t.alike(pixelAt(transformed, 0, 0), [255, 255, 0, 255])
  t.alike(pixelAt(transformed, 1, 0), [0, 255, 0, 255])
  t.alike(pixelAt(transformed, 0, 1), [0, 0, 255, 255])
  t.alike(pixelAt(transformed, 1, 1), [255, 0, 0, 255])
})

test('image orientate() animated', async (t) => {
  const animated = makeAnimatedRGBA()

  const transformed = await orientate(animated, { exif: 6 })

  t.ok(Array.isArray(transformed.frames))
  t.is(transformed.frames.length, 2)
  t.is(transformed.loops, animated.loops)
  t.is(transformed.width, 2)
  t.is(transformed.height, 2)
  t.is(transformed.frames[0].timestamp, 10)
  t.is(transformed.frames[1].timestamp, 20)

  for (const frame of transformed.frames) {
    t.alike(pixelAt(frame, 0, 0), [0, 0, 255, 255])
    t.alike(pixelAt(frame, 1, 0), [255, 0, 0, 255])
    t.alike(pixelAt(frame, 0, 1), [255, 255, 0, 255])
    t.alike(pixelAt(frame, 1, 1), [0, 255, 0, 255])
  }
})

test('image orientate() in pipeline', async (t) => {
  const path = './test/fixtures/exif-orientation.jpg'

  const rgba = await image(path).decode()
  const rgbaO = await image(path).decode().orientate()

  t.ok(Buffer.isBuffer(rgba.data))
  t.is(rgba.width, 120)
  t.is(rgba.height, 150)

  t.ok(Buffer.isBuffer(rgbaO.data))
  t.is(rgbaO.width, 150)
  t.is(rgbaO.height, 120)
})

test('image rotate()', (t) => {
  const rgba = makeRGBA()

  const rotated0 = rotate(rgba, { deg: 0 })
  const rotated90 = rotate(rgba, { deg: 90 })
  const rotated180 = rotate(rgba, { deg: 180 })
  const rotated270 = rotate(rgba, { deg: 270 })

  t.alike(pixelAt(rotated0, 0, 0), [255, 0, 0, 255])
  t.alike(pixelAt(rotated0, 1, 0), [0, 255, 0, 255])
  t.alike(pixelAt(rotated0, 0, 1), [0, 0, 255, 255])
  t.alike(pixelAt(rotated0, 1, 1), [255, 255, 0, 255])

  t.alike(pixelAt(rotated90, 0, 0), [0, 0, 255, 255])
  t.alike(pixelAt(rotated90, 1, 0), [255, 0, 0, 255])
  t.alike(pixelAt(rotated90, 0, 1), [255, 255, 0, 255])
  t.alike(pixelAt(rotated90, 1, 1), [0, 255, 0, 255])

  t.alike(pixelAt(rotated180, 0, 0), [255, 255, 0, 255])
  t.alike(pixelAt(rotated180, 1, 0), [0, 0, 255, 255])
  t.alike(pixelAt(rotated180, 0, 1), [0, 255, 0, 255])
  t.alike(pixelAt(rotated180, 1, 1), [255, 0, 0, 255])

  t.alike(pixelAt(rotated270, 0, 0), [0, 255, 0, 255])
  t.alike(pixelAt(rotated270, 1, 0), [255, 255, 0, 255])
  t.alike(pixelAt(rotated270, 0, 1), [255, 0, 0, 255])
  t.alike(pixelAt(rotated270, 1, 1), [0, 0, 255, 255])

  t.exception(() => rotate(rgba, { deg: 123 }))
})

test('image flip()', (t) => {
  const rgba = makeRGBA()

  const flipped = flip(rgba)
  const flippedH = flip(rgba, { h: true })
  const flippedV = flip(rgba, { h: false, v: true })
  const flippedHV = flip(rgba, { h: true, v: true })

  t.alike(pixelAt(flipped, 0, 0), pixelAt(flippedH, 0, 0))
  t.alike(pixelAt(flipped, 1, 0), pixelAt(flippedH, 1, 0))
  t.alike(pixelAt(flipped, 0, 1), pixelAt(flippedH, 0, 1))
  t.alike(pixelAt(flipped, 1, 1), pixelAt(flippedH, 1, 1))

  t.alike(pixelAt(flippedH, 0, 0), [0, 255, 0, 255])
  t.alike(pixelAt(flippedH, 1, 0), [255, 0, 0, 255])
  t.alike(pixelAt(flippedH, 0, 1), [255, 255, 0, 255])
  t.alike(pixelAt(flippedH, 1, 1), [0, 0, 255, 255])

  t.alike(pixelAt(flippedV, 0, 0), [0, 0, 255, 255])
  t.alike(pixelAt(flippedV, 1, 0), [255, 255, 0, 255])
  t.alike(pixelAt(flippedV, 0, 1), [255, 0, 0, 255])
  t.alike(pixelAt(flippedV, 1, 1), [0, 255, 0, 255])

  t.alike(pixelAt(flippedHV, 0, 0), [255, 255, 0, 255])
  t.alike(pixelAt(flippedHV, 1, 0), [0, 0, 255, 255])
  t.alike(pixelAt(flippedHV, 0, 1), [0, 255, 0, 255])
  t.alike(pixelAt(flippedHV, 1, 1), [255, 0, 0, 255])

  t.exception(() => flip(rgba, { h: 'not-bool' }))
})

test('image pipeline: decode + crop + resize + encode jpeg', async (t) => {
  const path = './test/fixtures/sample.jpg'

  const result = await image(path)
    .decode()
    .crop({ left: 75, top: 15, width: 50, height: 50 })
    .resize({ maxWidth: 32, maxHeight: 32 })
    .encode({ mimetype: 'image/webp' })

  t.ok(Buffer.isBuffer(result))
  t.is(result.byteLength, 442)
})

test('image pipeline: decode + crop + resize + encode + save jpeg', async (t) => {
  const path = './test/fixtures/sample.jpg'

  const outPath = barePath.join(os.tmpdir(), randomFileName('jpg'))

  await image(path)
    .decode()
    .crop({ left: 75, top: 15, width: 50, height: 50 })
    .resize({ maxWidth: 32, maxHeight: 32 })
    .encode({ mimetype: 'image/webp' })
    .save(outPath)

  const result = await image.read(outPath)

  t.ok(Buffer.isBuffer(result))
  t.is(result.byteLength, 442)

  t.teardown(() => {
    fs.rm(outPath, { force: true })
  })
})

test('calculateFitDimensions()', (t) => {
  {
    const width = 600
    const height = 200
    const maxWidth = 200
    const maxHeight = 100

    const dimensions = calculateFitDimensions(width, height, maxWidth, maxHeight)

    t.alike(dimensions, { width: 200, height: 67 })
  }

  {
    const width = 200
    const height = 400
    const maxWidth = 200
    const maxHeight = 100

    const dimensions = calculateFitDimensions(width, height, maxWidth, maxHeight)

    t.alike(dimensions, { width: 50, height: 100 })
  }

  {
    const width = 3464
    const height = 2130
    const maxWidth = 2560
    const maxHeight = 2560

    const dimensions = calculateFitDimensions(width, height, maxWidth, maxHeight)

    t.alike(dimensions, { width: 2560, height: 1574 })
  }

  {
    const width = 2130
    const height = 3464
    const maxWidth = 2560
    const maxHeight = 2560

    const dimensions = calculateFitDimensions(width, height, maxWidth, maxHeight)

    t.alike(dimensions, { width: 1574, height: 2560 })
  }
})
