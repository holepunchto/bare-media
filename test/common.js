import { test } from 'brittle'

import { calculateFitDimensions } from '../src/util'

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
