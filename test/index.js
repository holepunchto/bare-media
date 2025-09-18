import { test } from 'brittle'
import Corestore from 'corestore'
import BlobServer from 'hypercore-blob-server'
import Hyperblobs from 'hyperblobs'
import fetch from 'bare-fetch'
import fs from 'bare-fs'
import tmp from 'test-tmp'
import b4a from 'b4a'

import * as media from '../worker/media.js'
import { calculateFitDimensions } from '../worker/util.js'

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

test('media.createPreview() of an animated webp', async (t) => {
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

test('media.decodeImage() by path', async (t) => {
  const path = './test/fixtures/sample.heic'
  const mimetype = 'image/heic'

  // decode
  const { metadata, data } = await media.decodeImage({ path, mimetype })

  t.alike(metadata, { dimensions: { width: 152, height: 120 } })
  t.alike(data.slice(0, 4), b4a.from([0xcb, 0xdb, 0xc1, 0xff]))
  t.is(data.length, 72960)
})

test('media.decodeImage() by httpLink', async (t) => {
  const store = new Corestore(await tmp())

  const core = store.get({ name: 'test' })
  const blobs = new Hyperblobs(core)
  t.teardown(() => blobs.close())

  const path = './test/fixtures/sample.heic'
  const mimetype = 'image/heic'
  const buffer = fs.readFileSync(path)

  // save file
  const id = await blobs.put(buffer)

  const server = new BlobServer(store)
  t.teardown(() => server.close())
  await server.listen()

  // get link
  const httpLink = server.getLink(blobs.core.key, { blob: id })
  const res = await fetch(httpLink)
  t.is(res.status, 200)
  t.alike(await res.buffer(), buffer)

  // decode
  const { metadata, data } = await media.decodeImage({ httpLink, mimetype })

  t.alike(metadata, { dimensions: { width: 152, height: 120 } })
  t.alike(data.slice(0, 4), b4a.from([0xcb, 0xdb, 0xc1, 0xff]))
  t.is(data.length, 72960)
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
