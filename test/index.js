import { test } from 'brittle'
import fs from 'bare-fs'
import b4a from 'b4a'

import * as media from '../worker/media.js'
import { calculateFitDimensions } from '../worker/util.js'
import { makeHttpLink, isAnimatedWebP } from './helpers'

test('media.createImagePreview() of .jpg', async (t) => {
  const path = './test/fixtures/sample.jpg'
  const maxWidth = 32
  const maxHeight = 32

  const { metadata, preview } = await media.createImagePreview({
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

test('media.createImagePreview() of .png', async (t) => {
  const path = './test/fixtures/sample.png'
  const maxWidth = 32
  const maxHeight = 32

  const { metadata, preview } = await media.createImagePreview({
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

test('media.createImagePreview() of .avif', async (t) => {
  const path = './test/fixtures/sample.avif'
  const maxWidth = 32
  const maxHeight = 32

  const { metadata, preview } = await media.createImagePreview({
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

test('media.createImagePreview() of .heic', async (t) => {
  const path = './test/fixtures/sample.heic'
  const maxWidth = 32
  const maxHeight = 32

  const { metadata, preview } = await media.createImagePreview({
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

test('media.createImagePreview() of .tiff', async (t) => {
  const path = './test/fixtures/sample.tiff'
  const maxWidth = 32
  const maxHeight = 32

  const { metadata, preview } = await media.createImagePreview({
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

test('media.createImagePreview() of .gif (animated)', async (t) => {
  const path = './test/fixtures/sample.gif'
  const maxWidth = 100
  const maxHeight = 100

  const { metadata, preview } = await media.createImagePreview({
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

test('media.createImagePreview() of .gif with maxFrames', async (t) => {
  const path = './test/fixtures/sample.gif'
  const maxWidth = 100
  const maxHeight = 100
  const maxFrames = 1

  const { metadata, preview } = await media.createImagePreview({
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

test('media.createImagePreview() of .webp', async (t) => {
  const path = './test/fixtures/sample.webp'
  const maxWidth = 32
  const maxHeight = 32

  const { metadata, preview } = await media.createImagePreview({
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

test('media.createImagePreview() of .webp with maxBytes (reducing quality)', async (t) => {
  const path = './test/fixtures/sample.webp'
  const maxWidth = 100
  const maxHeight = 100
  const maxBytes = 1500

  const { metadata, preview } = await media.createImagePreview({
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

test("media.createImagePreview() of .webp with maxBytes throws if bytes can't fit", async (t) => {
  const path = './test/fixtures/sample.webp'
  const maxWidth = 100
  const maxHeight = 100
  const maxBytes = 500

  await t.exception(async () => {
    await media.createImagePreview({
      path,
      maxWidth,
      maxHeight,
      maxBytes
    })
  })
})

test('media.createImagePreview() does not upscale images', async (t) => {
  const path = './test/fixtures/sample.heic'
  const maxWidth = 256
  const maxHeight = 256

  const { metadata, preview } = await media.createImagePreview({
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

test('media.createImagePreview() without resizing', async (t) => {
  const path = './test/fixtures/sample.heic'

  const { metadata, preview } = await media.createImagePreview({ path })

  t.alike(metadata, { dimensions: { width: 152, height: 120 } })
  t.alike(preview.metadata, {
    mimetype: 'image/webp',
    dimensions: { width: 152, height: 120 }
  })
  t.ok(Buffer.isBuffer(preview.buffer))
  t.absent(preview.inlined)
})

test('media.createImagePreview() of an animated .webp', async (t) => {
  const path = './test/fixtures/animated.webp'
  const maxWidth = 32
  const maxHeight = 32

  const { metadata, preview } = await media.createImagePreview({
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

test('media.createImagePreview() of an animated .webp with maxFrames', async (t) => {
  const path = './test/fixtures/animated.webp'
  const maxWidth = 32
  const maxHeight = 32
  const maxFrames = 1

  const { metadata, preview } = await media.createImagePreview({
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

test('media.createImagePreview() of an animated .webp with maxBytes (reducing quality)', async (t) => {
  const path = './test/fixtures/animated.webp'
  const maxWidth = 32
  const maxHeight = 32
  const maxBytes = 3 * 1024

  const { metadata, preview } = await media.createImagePreview({
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

test('media.createImagePreview() of an animated webp with maxBytes (reducing fps)', async (t) => {
  const path = './test/fixtures/animated.webp'
  const maxWidth = 32
  const maxHeight = 32
  const maxBytes = 2 * 1024

  const { metadata, preview } = await media.createImagePreview({
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

test('media.createImagePreview() passing mimetype', async (t) => {
  const path = './test/fixtures/jpg-sample'
  const mimetype = 'image/jpg'
  const maxWidth = 32
  const maxHeight = 32

  const { metadata, preview } = await media.createImagePreview({
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

test('media.createImagePreview() with wrong file extension', async (t) => {
  const path = './test/fixtures/wrong-extension.jpg'
  const maxWidth = 32
  const maxHeight = 32

  const { metadata, preview } = await media.createImagePreview({
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

test('media.createImagePreview() by httpLink', async (t) => {
  const path = './test/fixtures/sample.jpg'
  const mimetype = 'image/jpeg'
  const maxWidth = 32
  const maxHeight = 32
  const httpLink = await makeHttpLink(t, path)

  const { metadata, preview } = await media.createImagePreview({
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

test('media.createImagePreview() by buffer', async (t) => {
  const path = './test/fixtures/sample.jpg'
  const mimetype = 'image/jpeg'
  const maxWidth = 32
  const maxHeight = 32

  const buffer = fs.readFileSync(path)

  const { metadata, preview } = await media.createImagePreview({
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

// Video preview tests

test('media.createVideoPreview() single frame of .mp4', async (t) => {
  const path = './test/fixtures/sample.mp4'
  const maxWidth = 64
  const maxHeight = 64

  const { metadata, preview } = await media.createVideoPreview({
    path,
    maxWidth,
    maxHeight
  })

  t.ok(metadata.dimensions.width > 0)
  t.ok(metadata.dimensions.height > 0)
  t.ok(metadata.duration > 0)
  t.is(preview.metadata.mimetype, 'image/webp')
  t.ok(preview.metadata.dimensions.width <= maxWidth)
  t.ok(preview.metadata.dimensions.height <= maxHeight)
  t.ok(Buffer.isBuffer(preview.buffer))
  t.not(isAnimatedWebP(preview.buffer))
  t.absent(preview.inlined)
})

test('media.createVideoPreview() with timestamp', async (t) => {
  const path = './test/fixtures/sample.mp4'
  const maxWidth = 64
  const maxHeight = 64

  const { metadata, preview } = await media.createVideoPreview({
    path,
    maxWidth,
    maxHeight,
    timestamp: 1000
  })

  t.ok(metadata.duration > 0)
  t.is(preview.metadata.mimetype, 'image/webp')
  t.ok(Buffer.isBuffer(preview.buffer))
})

test('media.createVideoPreview() with percent', async (t) => {
  const path = './test/fixtures/sample.mp4'
  const maxWidth = 64
  const maxHeight = 64

  const { metadata, preview } = await media.createVideoPreview({
    path,
    maxWidth,
    maxHeight,
    percent: 50
  })

  t.ok(metadata.duration > 0)
  t.is(preview.metadata.mimetype, 'image/webp')
  t.ok(Buffer.isBuffer(preview.buffer))
})

test('media.createVideoPreview() animated preview', async (t) => {
  const path = './test/fixtures/sample.mp4'
  const maxWidth = 64
  const maxHeight = 64

  const { metadata, preview } = await media.createVideoPreview({
    path,
    maxWidth,
    maxHeight,
    animated: true,
    frameCount: 5
  })

  t.ok(metadata.duration > 0)
  t.is(preview.metadata.mimetype, 'image/webp')
  t.ok(Buffer.isBuffer(preview.buffer))
  t.ok(isAnimatedWebP(preview.buffer))
})

test('media.createVideoPreview() with maxBytes', async (t) => {
  const path = './test/fixtures/sample.mp4'
  const maxWidth = 64
  const maxHeight = 64
  const maxBytes = 5000

  const { preview } = await media.createVideoPreview({
    path,
    maxWidth,
    maxHeight,
    animated: true,
    maxBytes
  })

  t.ok(preview.buffer.byteLength <= maxBytes)
})

test('media.createVideoPreview() throws for unsupported mimetype', async (t) => {
  await t.exception(async () => {
    await media.createVideoPreview({
      path: './test/fixtures/sample.jpg',
      mimetype: 'image/jpeg'
    })
  })
})

test('media.createVideoPreview() by buffer', async (t) => {
  const path = './test/fixtures/sample.mp4'
  const mimetype = 'video/mp4'
  const maxWidth = 64
  const maxHeight = 64

  const buffer = fs.readFileSync(path)

  const { metadata, preview } = await media.createVideoPreview({
    buffer,
    mimetype,
    maxWidth,
    maxHeight
  })

  t.ok(metadata.duration > 0)
  t.is(preview.metadata.mimetype, 'image/webp')
  t.ok(Buffer.isBuffer(preview.buffer))
})
