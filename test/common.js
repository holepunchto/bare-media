import { test } from 'brittle'

import { calculateFitDimensions, detectMimeType } from '../src/util'

// util

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

test('util detectMimeType()', async (t) => {
  t.is(detectMimeType(Buffer.from([0xff, 0xd8, 0xff])), 'image/jpeg')
  t.is(detectMimeType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png')
  t.is(detectMimeType(Buffer.from([0x47, 0x49, 0x46, 0x38])), 'image/gif')
  t.is(detectMimeType(Buffer.from('<svg></svg>')), 'image/svg+xml')
  t.is(detectMimeType(Buffer.from('not an image')), null)
})

// types

test('codecs support flags', async (t) => {
  const { isImageSupported, isVideoSupported, isMediaSupported } = await import('../types')

  t.ok(isImageSupported('image/jpeg'))
  t.ok(isImageSupported('image/png'))
  t.absent(isImageSupported('video/mp4'))

  t.ok(isVideoSupported('video/mp4'))
  t.absent(isVideoSupported('image/jpeg'))

  t.ok(isMediaSupported('image/jpeg'))
  t.ok(isMediaSupported('video/mp4'))
  t.absent(isMediaSupported('application/pdf'))
})
