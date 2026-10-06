import { test } from 'brittle'
import fs from 'bare-fs'
import path from 'bare-path'
import tmp from 'test-tmp'

import { detectMimeType } from '..'
import { isImageSupported, isVideoSupported, isMediaSupported } from '../types'

test('detectMimeType()', (t) => {
  t.is(detectMimeType(Buffer.from([0xff, 0xd8, 0xff])), 'image/jpeg')
  t.is(detectMimeType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png')
  t.is(detectMimeType(Buffer.from([0x47, 0x49, 0x46, 0x38])), 'image/gif')
  t.is(detectMimeType(Buffer.from('<svg></svg>')), 'image/svg+xml')
  t.is(detectMimeType(Buffer.from('not an image')), null)
})

test('detectMimeType.fromPath()', async (t) => {
  t.is(await detectMimeType.fromPath('./test/fixtures/sample.jpg'), 'image/jpeg', 'jpeg')
  t.is(await detectMimeType.fromPath('./test/fixtures/sample.png'), 'image/png', 'png')
  t.is(await detectMimeType.fromPath('./test/fixtures/sample.mp4'), 'video/mp4', 'mp4')
  t.is(await detectMimeType.fromPath('./test/fixtures/wrong-extension.jpg'), 'image/png', 'png wrong extension')
})

test('detectMimeType.fromPath() rejects ambiguous formats', async (t) => {
  const dir = await tmp(t)
  const cases = [
    {
      name: 'octet-stream',
      filename: 'ambiguous.cr3',
      hex: '00000010667479706372782000000000',
    },
    {
      name: 'audio without an audio track',
      filename: 'ambiguous.m4a',
      hex: '00000010667479704d34412000000000',
    },
    {
      name: 'video without a video track',
      filename: 'ambiguous.mp4',
      hex: '000000106674797069736f6d00000000',
    }
  ]

  for (const testCase of cases) {
    const filepath = path.join(dir, testCase.filename)
    fs.writeFileSync(filepath, Buffer.from(testCase.hex, 'hex'))
    t.is(await detectMimeType.fromPath(filepath), null, `null for ${testCase.name}`)
  }
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
