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

test('video.getFormatRegistry() - has built-in formats', async (t) => {
  const registry = await video.getFormatRegistry()

  t.ok(registry.hasFormat('webm'), 'webm is registered')
  t.ok(registry.hasFormat('mp4'), 'mp4 is registered')
  t.ok(registry.hasFormat('matroska'), 'matroska is registered')
  t.ok(registry.hasFormat('mkv'), 'mkv is registered')
  t.absent(registry.hasFormat('avi'), 'avi is not registered')
})

test('video.getFormatRegistry() - getVideoConfig returns codec info', async (t) => {
  const registry = await video.getFormatRegistry()

  const webmVideo = registry.getVideoConfig('webm')
  t.ok(webmVideo.id !== undefined, 'webm video has codec id')
  t.ok(webmVideo.format !== undefined, 'webm video has pixel format')
  t.is(webmVideo.encoder, 'libvpx', 'webm video encoder is libvpx')
})

test('video.getFormatRegistry() - getAudioConfig returns codec info', async (t) => {
  const registry = await video.getFormatRegistry()

  const webmAudio = registry.getAudioConfig('webm')
  t.ok(webmAudio.id !== undefined, 'webm audio has codec id')
  t.is(webmAudio.sampleRate, 48000, 'webm audio sample rate is 48000')
  t.is(webmAudio.encoder, 'libopus', 'webm audio encoder is libopus')
})

test('video.getFormatRegistry() - getMuxerOptions returns muxer config', async (t) => {
  const registry = await video.getFormatRegistry()

  const webmMuxer = registry.getMuxerOptions('webm')
  t.is(webmMuxer.live, '1', 'webm muxer has live option')

  const mp4Muxer = registry.getMuxerOptions('mp4')
  t.ok(mp4Muxer.movflags, 'mp4 muxer has movflags')
})

test('video.getFormatRegistry() - getMuxerOptions returns empty object for unknown format', async (t) => {
  const registry = await video.getFormatRegistry()

  const unknownMuxer = registry.getMuxerOptions('unknown')
  t.alike(unknownMuxer, {}, 'unknown format returns empty muxer options')
})

test('video.getFormatRegistry() - getVideoConfig throws for unsupported format', async (t) => {
  const registry = await video.getFormatRegistry()

  t.exception(() => registry.getVideoConfig('avi'), /Unsupported video output format/)
})

test('video.getFormatRegistry() - getAudioConfig throws for unsupported format', async (t) => {
  const registry = await video.getFormatRegistry()

  t.exception(() => registry.getAudioConfig('avi'), /Unsupported audio output format/)
})

test('video.getFormatRegistry() - register custom format', async (t) => {
  const ffmpeg = (await import('bare-ffmpeg')).default
  const registry = await video.getFormatRegistry()

  registry.register('mp4-ios', {
    video: {
      id: ffmpeg.constants.codecs.H264,
      format: ffmpeg.constants.pixelFormats.YUV420P,
      encoder: 'h264_videotoolbox'
    },
    audio: {
      id: ffmpeg.constants.codecs.AAC,
      format: ffmpeg.constants.sampleFormats.FLTP,
      sampleRate: 48000,
      encoder: 'aac'
    },
    muxer: {
      movflags: 'frag_keyframe+empty_moov+default_base_moof'
    }
  })

  t.ok(registry.hasFormat('mp4-ios'), 'mp4-ios format is registered')
  t.is(registry.getVideoConfig('mp4-ios').encoder, 'h264_videotoolbox')
  t.is(registry.getAudioConfig('mp4-ios').encoder, 'aac')
  t.is(registry.getAudioConfig('mp4-ios').sampleRate, 48000)
  t.ok(registry.getMuxerOptions('mp4-ios').movflags, 'mp4-ios has movflags')
})

test('video.getFormatRegistry() - returns same instance', async (t) => {
  const registry1 = await video.getFormatRegistry()
  const registry2 = await video.getFormatRegistry()

  t.is(registry1, registry2, 'Same registry instance is returned')
})

test('video.transcode() - throws error for unsupported format', async (t) => {
  const path = './test/fixtures/sample.mp4'

  await t.exception(async () => {
    for await (const chunk of video(path).transcode({ format: 'avi' })) {
      // Should throw before yielding
    }
  }, /Unsupported.*output format/)
})
