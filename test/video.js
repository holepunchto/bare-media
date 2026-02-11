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
    width: 320,
    height: 240
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
    width: 320,
    height: 240
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

test('video.transcode() - yields chunks incrementally (not all at once)', async (t) => {
  const path = './test/fixtures/sample.webm'
  const iterator = video(path)
    .transcode({
      format: 'mp4',
      width: 320,
      height: 240
    })
    [Symbol.asyncIterator]()

  const first = await iterator.next()
  t.absent(first.done, 'First chunk yielded before transcoding is complete')
  t.ok(Buffer.isBuffer(first.value.buffer), 'First chunk has a buffer')

  // Drain the rest
  let count = 1
  while (true) {
    const { done } = await iterator.next()
    if (done) break
    count++
  }

  t.ok(count > 1, `Received ${count} chunks total (streamed incrementally)`)
})

test('video.transcode() - can pause, resume, and get valid output', async (t) => {
  const path = './test/fixtures/sample.webm'
  const iterator = video(path)
    .transcode({
      format: 'mp4',
      width: 320,
      height: 240
    })
    [Symbol.asyncIterator]()

  const firstBatch = []
  for (let i = 0; i < 3; i++) {
    const { value, done } = await iterator.next()
    if (done) break
    firstBatch.push(value)
  }
  t.ok(firstBatch.length > 0, `Paused after ${firstBatch.length} chunk(s)`)

  const secondBatch = []
  while (true) {
    const { value, done } = await iterator.next()
    if (done) break
    secondBatch.push(value)
  }
  t.ok(secondBatch.length > 0, `Resumed and got ${secondBatch.length} more chunk(s)`)

  const totalBuffer = b4a.concat([...firstBatch, ...secondBatch].map((c) => c.buffer))
  const header = b4a.toString(totalBuffer.subarray(4, 8))
  t.is(header, 'ftyp', 'Combined output is valid MP4')
})

test('video.transcode() - stopping early cleans up resources', async (t) => {
  const path = './test/fixtures/sample.webm'
  const chunks = []

  for await (const chunk of video(path).transcode({
    format: 'mp4',
    width: 320,
    height: 240
  })) {
    chunks.push(chunk)
    if (chunks.length === 1) break
  }

  t.ok(chunks.length === 1, `Stopped early after ${chunks.length} chunk(s)`)

  // If cleanup didn't run (fd leaked, ffmpeg contexts not freed),
  // this second full transcode on the same file would fail.
  const fullChunks = []
  for await (const chunk of video(path).transcode({
    format: 'mp4',
    width: 320,
    height: 240
  })) {
    fullChunks.push(chunk)
  }

  const totalBuffer = b4a.concat(fullChunks.map((c) => c.buffer))
  const header = b4a.toString(totalBuffer.subarray(4, 8))
  t.is(header, 'ftyp', 'Full transcode after early stop produces valid MP4')
})

test('video.transcode() - throws error for unsupported format', async (t) => {
  const path = './test/fixtures/sample.mp4'

  await t.exception(async () => {
    for await (const chunk of video(path).transcode({ format: 'avi' })) {
      // Should throw before yielding
    }
  }, /Unsupported.*output format/)
})
