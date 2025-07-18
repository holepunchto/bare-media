import { test } from 'brittle'
import * as media from '../worker/media.js'

test('media.createPreview()', async t => {
  const path = './test/fixtures/sample.heic'
  const mimetype = 'image/heic'
  const maxWidth = 32
  const maxHeight = 32

  const { metadata, preview } = await media.createPreview({ path, mimetype, maxWidth, maxHeight })
  console.log(preview.metadata)

  t.alike(metadata, { dimensions: { width: 150, height: 120 } })
  t.alike(preview.metadata, { mimetype: 'image/webp', dimensions: { width: 32, height: 26 } })

  t.ok(Buffer.isBuffer(preview.buffer))
  t.absent(preview.inlined)
})

test('media.createPreview() does not upscale images', async t => {
  const path = './test/fixtures/sample.heic'
  const mimetype = 'image/heic'
  const maxWidth = 256
  const maxHeight = 256

  const { metadata, preview } = await media.createPreview({ path, mimetype, maxWidth, maxHeight })

  t.alike(metadata, { dimensions: { width: 150, height: 120 } })
  t.alike(preview.metadata, { mimetype: 'image/webp', dimensions: { width: 150, height: 120 } })

  t.ok(Buffer.isBuffer(preview.buffer))
  t.absent(preview.inlined)
})

test('media.createPreview() without resizing', async t => {
  const path = './test/fixtures/sample.heic'
  const mimetype = 'image/heic'

  const { metadata, preview } = await media.createPreview({ path, mimetype })

  t.alike(metadata, { dimensions: { width: 150, height: 120 } })
  t.alike(preview.metadata, { mimetype: 'image/webp', dimensions: { width: 150, height: 120 } })

  t.ok(Buffer.isBuffer(preview.buffer))
  t.absent(preview.inlined)
})

test('media.createPreviewAll()', async t => {
  const path = './test/fixtures/sample.heic'
  const mimetype = 'image/heic'
  const maxWidth = { small: 16, medium: 32, large: 64 }
  const maxHeight = { small: 16, medium: 32, large: 64 }

  const { metadata, preview } = await media.createPreviewAll({ path, mimetype, maxWidth, maxHeight })
  console.log(preview.small.metadata)
  console.log(preview.medium.metadata)
  console.log(preview.large.metadata)

  t.alike(metadata, { dimensions: { width: 150, height: 120 } })
  t.alike(preview.small.metadata, { mimetype: 'image/webp', dimensions: { width: 16, height: 13 } })
  t.alike(preview.medium.metadata, { mimetype: 'image/webp', dimensions: { width: 32, height: 26 } })
  t.alike(preview.large.metadata, { mimetype: 'image/webp', dimensions: { width: 64, height: 51 } })

  t.ok(preview.small.inlined)
  t.ok(preview.medium.inlined)
  t.ok(preview.large.buffer)

  t.ok(typeof preview.small.inlined === 'string')
  t.ok(typeof preview.medium.inlined === 'string')
  t.ok(Buffer.isBuffer(preview.large.buffer))

  t.absent(preview.small.buffer)
  t.absent(preview.medium.buffer)
  t.absent(preview.large.inlined)
})
