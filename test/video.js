import { test } from 'brittle'
import fs from 'bare-fs'

import { video } from '..'

test('video extractFrames()', async (t) => {
  const path = './test/fixtures/sample.mp4'

  const fd = fs.openSync(path, 'r')
  const rgba = video.extractFrames(fd, { frameIndex: 1 })
  fs.closeSync(fd)

  t.ok(Buffer.isBuffer(rgba.data))
  t.is(rgba.width, 320)
  t.is(rgba.height, 240)
})

test('video pipeline', async (t) => {
  const path = './test/fixtures/sample.mp4'

  const rgba = video(path).extractFrames({ frameIndex: 1 })

  t.ok(Buffer.isBuffer(rgba.data))
  t.is(rgba.width, 320)
  t.is(rgba.height, 240)
})
