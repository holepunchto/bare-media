import { test } from 'brittle'
import * as media from '../worker/media.js'

test('media.createPreview()', async t => {
  const path = './test/fixtures/sample.heic'
  const maxSize = 32

  const { metadata, preview } = await media.createPreview({ path, maxSize })

  t.alike(metadata, { dimensions: { width: 200, height: 200 } })
  t.alike(preview.metadata, { mimetype: 'image/webp', dimensions: { width: 32, height: 32 } })

  t.ok(Buffer.isBuffer(preview.buffer))
  t.absent(preview.inlined)
})

test('media.createPreviewAll()', async t => {
  const path = './test/fixtures/sample.heic'
  const maxSize = { small: 16, medium: 32, large: 64 }

  const { metadata, preview } = await media.createPreviewAll({ path, maxSize })

  t.alike(metadata, { dimensions: { width: 200, height: 200 } })
  t.alike(preview.small.metadata, { mimetype: 'image/webp', dimensions: { width: 16, height: 16 } })
  t.alike(preview.medium.metadata, { mimetype: 'image/webp', dimensions: { width: 32, height: 32 } })
  t.alike(preview.large.metadata, { mimetype: 'image/webp', dimensions: { width: 64, height: 64 } })

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
