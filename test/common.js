import { test } from 'brittle'

import { detectMimeType } from '..'
import { isImageSupported, isVideoSupported, isMediaSupported } from '../types'

test('detectMimeType()', (t) => {
  t.is(detectMimeType(Buffer.from([0xff, 0xd8, 0xff])), 'image/jpeg')
  t.is(detectMimeType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png')
  t.is(detectMimeType(Buffer.from([0x47, 0x49, 0x46, 0x38])), 'image/gif')
  t.is(detectMimeType(Buffer.from('<svg></svg>')), 'image/svg+xml')
  t.is(detectMimeType(Buffer.from('not an image')), null)
})

test('codecs support flags', (t) => {
  t.ok(isImageSupported('image/jpeg'))
  t.ok(isImageSupported('image/png'))
  t.absent(isImageSupported('video/mp4'))

  t.ok(isVideoSupported('video/mp4'))
  t.absent(isVideoSupported('image/jpeg'))

  t.ok(isMediaSupported('image/jpeg'))
  t.ok(isMediaSupported('video/mp4'))
  t.absent(isMediaSupported('application/pdf'))
})
