import { test } from 'brittle'
import fs from 'bare-fs'
import b4a from 'b4a'

import { video } from '..'

test('video extractFrames()', async (t) => {
  const path = './test/fixtures/sample.mp4'

  const fd = fs.openSync(path, 'r')
  const rgba = await video.extractFrames(fd, { frameIndex: 1 })
  fs.closeSync(fd)

  t.ok(Buffer.isBuffer(rgba.data))
  t.is(rgba.width, 320)
  t.is(rgba.height, 240)
})

test('video pipeline', async (t) => {
  const path = './test/fixtures/sample.mp4'

  const rgba = await video(path).extractFrames({ frameIndex: 1 })

  t.ok(Buffer.isBuffer(rgba.data))
  t.is(rgba.width, 320)
  t.is(rgba.height, 240)
})

test('video.transcode() - webm to mp4', async (t) => {
  const path = './test/fixtures/sample.webm'

  const chunks = []
  for await (const chunk of video(path).transcode({
    format: 'mp4',
    width: 1280,
    height: 720
  })) {
    chunks.push(chunk)
  }

  t.ok(chunks.length > 0, 'Received some chunks')

  const totalOutputBuffer = b4a.concat(chunks.map((c) => c.buffer))
  t.ok(totalOutputBuffer.length > 0, 'Total output buffer has data')

  // Check for MP4 header (e.g., ftyp box)
  const header = b4a.toString(totalOutputBuffer.subarray(4, 8))
  t.is(header, 'ftyp', 'Output starts with MP4 ftyp marker')
})

test('video.transcode() - mp4 to webm', async (t) => {
  const path = './test/fixtures/sample.mp4'

  const chunks = []
  for await (const chunk of video(path).transcode({
    format: 'webm',
    width: 1280,
    height: 720
  })) {
    chunks.push(chunk)
  }

  t.ok(chunks.length > 0, 'Received some chunks')

  const totalOutputBuffer = b4a.concat(chunks.map((c) => c.buffer))
  t.ok(totalOutputBuffer.length > 0, 'Total output buffer has data')

  // Check for WebM/EBML header
  t.is(totalOutputBuffer[0], 0x1a, 'Output starts with EBML header byte 0')
  t.is(totalOutputBuffer[1], 0x45, 'Output starts with EBML header byte 1')
  t.is(totalOutputBuffer[2], 0xdf, 'Output starts with EBML header byte 2')
  t.is(totalOutputBuffer[3], 0xa3, 'Output starts with EBML header byte 3')
})

test('video.transcode() - mkv to mp4', async (t) => {
  const path = './test/fixtures/sample.mkv'

  const chunks = []
  for await (const chunk of video(path).transcode({
    format: 'mp4',
    width: 320,
    height: 240
  })) {
    chunks.push(chunk)
  }

  t.ok(chunks.length > 0, 'Received some chunks')

  const totalOutputBuffer = b4a.concat(chunks.map((c) => c.buffer))
  t.ok(totalOutputBuffer.length > 0, 'Total output buffer has data')

  // Check for MP4 header
  const header = b4a.toString(totalOutputBuffer.subarray(4, 8))
  t.is(header, 'ftyp', 'Output starts with MP4 ftyp marker')
})

test('video.transcode() - mp4 to matroska', async (t) => {
  const path = './test/fixtures/sample.mp4'

  const chunks = []
  for await (const chunk of video(path).transcode({
    format: 'matroska',
    width: 320,
    height: 240
  })) {
    chunks.push(chunk)
  }

  t.ok(chunks.length > 0, 'Received some chunks')

  const totalOutputBuffer = b4a.concat(chunks.map((c) => c.buffer))
  t.ok(totalOutputBuffer.length > 0, 'Total output buffer has data')

  // Check for Matroska/EBML header
  t.is(totalOutputBuffer[0], 0x1a, 'Output starts with EBML header byte 0')
  t.is(totalOutputBuffer[1], 0x45, 'Output starts with EBML header byte 1')
  t.is(totalOutputBuffer[2], 0xdf, 'Output starts with EBML header byte 2')
  t.is(totalOutputBuffer[3], 0xa3, 'Output starts with EBML header byte 3')
})

test('video.transcode() - throws error for unsupported format', async (t) => {
  const path = './test/fixtures/sample.mp4'

  await t.exception(async () => {
    for await (const chunk of video(path).transcode({ format: 'avi' })) {
      // Should throw before yielding
    }
  }, /Unsupported.*output format/)
})
