import { test } from 'brittle'
import fs from 'bare-fs'
import b4a from 'b4a'

import * as media from '../worker/media.js'
import { calculateFitDimensions } from '../worker/util.js'
import { makeHttpLink, isAnimatedWebP } from './helpers'

test('media.createPreview() of .jpg', async (t) => {
  const path = './test/fixtures/sample.jpg'
  const maxWidth = 32
  const maxHeight = 32

  const { metadata, preview } = await media.createPreview({
    path,
    maxWidth,
    maxHeight
  })

  t.alike(metadata, { dimensions: { width: 150, height: 120 } })
  t.alike(preview.metadata, {
    mimetype: 'image/webp',
    dimensions: { width: 32, height: 26 }
  })
  t.ok(Buffer.isBuffer(preview.buffer))
  t.absent(preview.inlined)
})

test('media.createPreview() of .png', async (t) => {
  const path = './test/fixtures/sample.png'
  const maxWidth = 32
  const maxHeight = 32

  const { metadata, preview } = await media.createPreview({
    path,
    maxWidth,
    maxHeight
  })

  t.alike(metadata, { dimensions: { width: 150, height: 120 } })
  t.alike(preview.metadata, {
    mimetype: 'image/webp',
    dimensions: { width: 32, height: 26 }
  })
  t.ok(Buffer.isBuffer(preview.buffer))
  t.absent(preview.inlined)
})

test('media.createPreview() of .avif', async (t) => {
  const path = './test/fixtures/sample.avif'
  const maxWidth = 32
  const maxHeight = 32

  const { metadata, preview } = await media.createPreview({
    path,
    maxWidth,
    maxHeight
  })

  t.alike(metadata, { dimensions: { width: 128, height: 128 } })
  t.alike(preview.metadata, {
    mimetype: 'image/webp',
    dimensions: { width: 32, height: 32 }
  })
  t.ok(Buffer.isBuffer(preview.buffer))
  t.absent(preview.inlined)
})

test('media.createPreview() of .heic', async (t) => {
  const path = './test/fixtures/sample.heic'
  const maxWidth = 32
  const maxHeight = 32

  const { metadata, preview } = await media.createPreview({
    path,
    maxWidth,
    maxHeight
  })

  t.alike(metadata, { dimensions: { width: 152, height: 120 } })
  t.alike(preview.metadata, {
    mimetype: 'image/webp',
    dimensions: { width: 32, height: 25 }
  })
  t.ok(Buffer.isBuffer(preview.buffer))
  t.absent(preview.inlined)
})

test('media.createPreview() of .tiff', async (t) => {
  const path = './test/fixtures/sample.tiff'
  const maxWidth = 32
  const maxHeight = 32

  const { metadata, preview } = await media.createPreview({
    path,
    maxWidth,
    maxHeight
  })

  t.alike(metadata, { dimensions: { width: 75, height: 50 } })
  t.alike(preview.metadata, {
    mimetype: 'image/webp',
    dimensions: { width: 32, height: 21 }
  })
  t.ok(Buffer.isBuffer(preview.buffer))
  t.absent(preview.inlined)
})

test('media.createPreview() of .gif (animated)', async (t) => {
  const path = './test/fixtures/sample.gif'
  const maxWidth = 100
  const maxHeight = 100

  const { metadata, preview } = await media.createPreview({
    path,
    maxWidth,
    maxHeight
  })

  t.alike(metadata, { dimensions: { width: 400, height: 400 } })
  t.alike(preview.metadata, {
    mimetype: 'image/webp',
    dimensions: { width: 100, height: 100 }
  })
  t.ok(Buffer.isBuffer(preview.buffer))
  t.absent(preview.inlined)
})

test('media.createPreview() of .gif with maxFrames', async (t) => {
  const path = './test/fixtures/sample.gif'
  const maxWidth = 100
  const maxHeight = 100
  const maxFrames = 1

  const { metadata, preview } = await media.createPreview({
    path,
    maxWidth,
    maxHeight,
    maxFrames
  })

  t.alike(metadata, { dimensions: { width: 400, height: 400 } })
  t.alike(preview.metadata, {
    mimetype: 'image/webp',
    dimensions: { width: 100, height: 100 }
  })
  t.ok(Buffer.isBuffer(preview.buffer))
  t.not(isAnimatedWebP(preview.buffer))
  t.absent(preview.inlined)
})

test('media.createPreview() of .webp', async (t) => {
  const path = './test/fixtures/sample.webp'
  const maxWidth = 32
  const maxHeight = 32

  const { metadata, preview } = await media.createPreview({
    path,
    maxWidth,
    maxHeight
  })

  t.alike(metadata, { dimensions: { width: 150, height: 120 } })
  t.alike(preview.metadata, {
    mimetype: 'image/webp',
    dimensions: { width: 32, height: 26 }
  })
  t.ok(Buffer.isBuffer(preview.buffer))
  t.absent(preview.inlined)
})

test('media.createPreview() of .webp with maxBytes (reducing quality)', async (t) => {
  const path = './test/fixtures/sample.webp'
  const maxWidth = 100
  const maxHeight = 100
  const maxBytes = 1500

  const { metadata, preview } = await media.createPreview({
    path,
    maxWidth,
    maxHeight,
    maxBytes
  })

  t.alike(metadata, { dimensions: { width: 150, height: 120 } })
  t.alike(preview.metadata, {
    mimetype: 'image/webp',
    dimensions: { width: 100, height: 80 }
  })
  t.ok(Buffer.isBuffer(preview.buffer))
  t.absent(preview.inlined)
  t.ok(preview.buffer.byteLength <= maxBytes)
})

test("media.createPreview() of .webp with maxBytes throws if bytes can't fit", async (t) => {
  const path = './test/fixtures/sample.webp'
  const maxWidth = 100
  const maxHeight = 100
  const maxBytes = 500

  await t.exception(async () => {
    await media.createPreview({
      path,
      maxWidth,
      maxHeight,
      maxBytes
    })
  })
})

test('media.createPreview() does not upscale images', async (t) => {
  const path = './test/fixtures/sample.heic'
  const maxWidth = 256
  const maxHeight = 256

  const { metadata, preview } = await media.createPreview({
    path,
    maxWidth,
    maxHeight
  })

  t.alike(metadata, { dimensions: { width: 152, height: 120 } })
  t.alike(preview.metadata, {
    mimetype: 'image/webp',
    dimensions: { width: 152, height: 120 }
  })
  t.ok(Buffer.isBuffer(preview.buffer))
  t.absent(preview.inlined)
})

test('media.createPreview() without resizing', async (t) => {
  const path = './test/fixtures/sample.heic'

  const { metadata, preview } = await media.createPreview({ path })

  t.alike(metadata, { dimensions: { width: 152, height: 120 } })
  t.alike(preview.metadata, {
    mimetype: 'image/webp',
    dimensions: { width: 152, height: 120 }
  })
  t.ok(Buffer.isBuffer(preview.buffer))
  t.absent(preview.inlined)
})

test('media.createPreview() of an animated .webp', async (t) => {
  const path = './test/fixtures/animated.webp'
  const maxWidth = 32
  const maxHeight = 32

  const { metadata, preview } = await media.createPreview({
    path,
    maxWidth,
    maxHeight
  })

  t.alike(metadata, { dimensions: { width: 476, height: 280 } })
  t.alike(preview.metadata, {
    mimetype: 'image/webp',
    dimensions: { width: 32, height: 19 }
  })
  t.ok(Buffer.isBuffer(preview.buffer))
  t.ok(isAnimatedWebP(preview.buffer))
  t.absent(preview.inlined)
})

test('media.createPreview() of an animated .webp with maxFrames', async (t) => {
  const path = './test/fixtures/animated.webp'
  const maxWidth = 32
  const maxHeight = 32
  const maxFrames = 1

  const { metadata, preview } = await media.createPreview({
    path,
    maxWidth,
    maxHeight,
    maxFrames
  })

  t.alike(metadata, { dimensions: { width: 476, height: 280 } })
  t.alike(preview.metadata, {
    mimetype: 'image/webp',
    dimensions: { width: 32, height: 19 }
  })
  t.ok(Buffer.isBuffer(preview.buffer))
  t.not(isAnimatedWebP(preview.buffer))
  t.absent(preview.inlined)
})

test('media.createPreview() of an animated .webp with maxBytes (reducing quality)', async (t) => {
  const path = './test/fixtures/animated.webp'
  const maxWidth = 32
  const maxHeight = 32
  const maxBytes = 3 * 1024

  const { metadata, preview } = await media.createPreview({
    path,
    maxWidth,
    maxHeight,
    maxBytes
  })

  t.alike(metadata, { dimensions: { width: 476, height: 280 } })
  t.alike(preview.metadata, {
    mimetype: 'image/webp',
    dimensions: { width: 32, height: 19 }
  })
  t.ok(Buffer.isBuffer(preview.buffer))
  t.ok(isAnimatedWebP(preview.buffer))
  t.ok(preview.buffer.byteLength <= maxBytes)
  t.absent(preview.inlined)
})

test('media.createPreview() of an animated webp with maxBytes (reducing fps)', async (t) => {
  const path = './test/fixtures/animated.webp'
  const maxWidth = 32
  const maxHeight = 32
  const maxBytes = 2 * 1024

  const { metadata, preview } = await media.createPreview({
    path,
    maxWidth,
    maxHeight,
    maxBytes
  })

  t.alike(metadata, { dimensions: { width: 476, height: 280 } })
  t.alike(preview.metadata, {
    mimetype: 'image/webp',
    dimensions: { width: 32, height: 19 }
  })
  t.ok(Buffer.isBuffer(preview.buffer))
  t.not(isAnimatedWebP(preview.buffer))
  t.ok(preview.buffer.byteLength <= maxBytes)
  t.absent(preview.inlined)
})

test('media.createPreview() passing mimetype', async (t) => {
  const path = './test/fixtures/jpg-sample'
  const mimetype = 'image/jpg'
  const maxWidth = 32
  const maxHeight = 32

  const { metadata, preview } = await media.createPreview({
    path,
    mimetype,
    maxWidth,
    maxHeight
  })

  t.alike(metadata, { dimensions: { width: 150, height: 120 } })
  t.alike(preview.metadata, {
    mimetype: 'image/webp',
    dimensions: { width: 32, height: 26 }
  })
  t.ok(Buffer.isBuffer(preview.buffer))
  t.absent(preview.inlined)
})

test('media.createPreview() with wrong file extension', async (t) => {
  const path = './test/fixtures/wrong-extension.jpg'
  const maxWidth = 32
  const maxHeight = 32

  const { metadata, preview } = await media.createPreview({
    path,
    maxWidth,
    maxHeight
  })

  t.alike(metadata, { dimensions: { width: 150, height: 120 } })
  t.alike(preview.metadata, {
    mimetype: 'image/webp',
    dimensions: { width: 32, height: 26 }
  })
  t.ok(Buffer.isBuffer(preview.buffer))
  t.absent(preview.inlined)
})

test('media.createPreview() by httpLink', async (t) => {
  const path = './test/fixtures/sample.jpg'
  const mimetype = 'image/jpeg'
  const maxWidth = 32
  const maxHeight = 32
  const httpLink = await makeHttpLink(t, path)

  const { metadata, preview } = await media.createPreview({
    httpLink,
    mimetype,
    maxWidth,
    maxHeight
  })

  t.alike(metadata, { dimensions: { width: 150, height: 120 } })
  t.alike(preview.metadata, {
    mimetype: 'image/webp',
    dimensions: { width: 32, height: 26 }
  })
  t.ok(Buffer.isBuffer(preview.buffer))
  t.absent(preview.inlined)
})

test('media.createPreview() by buffer', async (t) => {
  const path = './test/fixtures/sample.jpg'
  const mimetype = 'image/jpeg'
  const maxWidth = 32
  const maxHeight = 32

  const buffer = fs.readFileSync(path)

  const { metadata, preview } = await media.createPreview({
    buffer,
    mimetype,
    maxWidth,
    maxHeight
  })

  t.alike(metadata, { dimensions: { width: 150, height: 120 } })
  t.alike(preview.metadata, {
    mimetype: 'image/webp',
    dimensions: { width: 32, height: 26 }
  })
  t.ok(Buffer.isBuffer(preview.buffer))
  t.absent(preview.inlined)
})

test('media.decodeImage() by path', async (t) => {
  const path = './test/fixtures/sample.heic'
  const mimetype = 'image/heic'

  const { metadata, data } = await media.decodeImage({ path, mimetype })

  t.alike(metadata, { dimensions: { width: 152, height: 120 } })
  t.alike(data.slice(0, 4), b4a.from([0xcb, 0xdb, 0xc1, 0xff]))
  t.is(data.length, 72960)
})

test('media.decodeImage() by httpLink', async (t) => {
  const path = './test/fixtures/sample.heic'
  const mimetype = 'image/heic'
  const httpLink = await makeHttpLink(t, path)

  const { metadata, data } = await media.decodeImage({ httpLink, mimetype })

  t.alike(metadata, { dimensions: { width: 152, height: 120 } })
  t.alike(data.slice(0, 4), b4a.from([0xcb, 0xdb, 0xc1, 0xff]))
  t.is(data.length, 72960)
})

test('media.decodeImage() by buffer', async (t) => {
  const path = './test/fixtures/sample.heic'
  const mimetype = 'image/heic'
  const buffer = fs.readFileSync(path)

  const { metadata, data } = await media.decodeImage({ buffer, mimetype })

  t.alike(metadata, { dimensions: { width: 152, height: 120 } })
  t.alike(data.slice(0, 4), b4a.from([0xcb, 0xdb, 0xc1, 0xff]))
  t.is(data.length, 72960)
})

test('media.cropImage()', async (t) => {
  const path = './test/fixtures/sample.jpg'

  const { metadata, data } = await media.cropImage({
    path,
    left: 75,
    top: 15,
    width: 50,
    height: 50
  })

  t.alike(metadata, { dimensions: { width: 150, height: 120 } })
  t.is(data.length, 1724)
})

test('media.cropImage() throws if the crop rectangle is out of bounds', async (t) => {
  const path = './test/fixtures/sample.jpg'

  await t.exception(async () => {
    const { metadata, data } = await media.cropImage({
      path,
      left: -1,
      top: 15,
      width: 50,
      height: 50
    })
  })
  await t.exception(async () => {
    const { metadata, data } = await media.cropImage({
      path,
      left: 75,
      top: -1,
      width: 50,
      height: 50
    })
  })
  await t.exception(async () => {
    const { metadata, data } = await media.cropImage({
      path,
      left: 75,
      top: 15,
      width: 76,
      height: 50
    })
  })
  await t.exception(async () => {
    const { metadata, data } = await media.cropImage({
      path,
      left: 75,
      top: 15,
      width: 50,
      height: 106
    })
  })
})

test('util calculateFitDimensions()', async (t) => {
  {
    const width = 600
    const height = 200
    const maxWidth = 200
    const maxHeight = 100

    const dimensions = calculateFitDimensions(
      width,
      height,
      maxWidth,
      maxHeight
    )

    t.alike(dimensions, { width: 200, height: 67 })
  }

  {
    const width = 200
    const height = 400
    const maxWidth = 200
    const maxHeight = 100

    const dimensions = calculateFitDimensions(
      width,
      height,
      maxWidth,
      maxHeight
    )

    t.alike(dimensions, { width: 50, height: 100 })
  }

  {
    const width = 3464
    const height = 2130
    const maxWidth = 2560
    const maxHeight = 2560

    const dimensions = calculateFitDimensions(
      width,
      height,
      maxWidth,
      maxHeight
    )

    t.alike(dimensions, { width: 2560, height: 1574 })
  }

  {
    const width = 2130
    const height = 3464
    const maxWidth = 2560
    const maxHeight = 2560

    const dimensions = calculateFitDimensions(
      width,
      height,
      maxWidth,
      maxHeight
    )

    t.alike(dimensions, { width: 1574, height: 2560 })
  }
})
