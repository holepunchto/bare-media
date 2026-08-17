import { test } from 'brittle'
import fs from 'bare-fs'
import b4a from 'b4a'
import os from 'bare-os'
import barePath from 'bare-path'
import ffmpeg from 'bare-ffmpeg'

import { image, video } from '..'
import { parseDisplayMatrix } from '../src/video/metadata'
import { createIOContext } from '../src/video/io'
import { createDisplayMatrix, randomFileName } from './helpers'

test('video extractFrames()', async (t) => {
  const path = './test/fixtures/sample.mp4'

  const fd = fs.openSync(path, 'r')
  const rgba = await video.extractFrames(fd, { frameIndex: 1 })
  fs.closeSync(fd)

  t.ok(Buffer.isBuffer(rgba.data))
  t.is(rgba.width, 320)
  t.is(rgba.height, 240)
})

test('video extractFrames() in pipeline', async (t) => {
  const path = './test/fixtures/sample.mp4'

  const rgba = await video(path).extractFrames({ frameIndex: 1 })

  t.ok(Buffer.isBuffer(rgba.data))
  t.is(rgba.width, 320)
  t.is(rgba.height, 240)
})

test('video metadata()', async (t) => {
  const path = './test/fixtures/orientation.mov'

  const fd = fs.openSync(path, 'r')
  const metadata = await video.metadata(fd)
  fs.closeSync(fd)

  const constants = await video.getConstants()

  t.alike(metadata, {
    width: 120,
    height: 160,
    codec: {
      id: constants.codecs.H264,
      name: 'h264'
    },
    duration: 10,
    avgFramerate: {
      numerator: 1,
      denominator: 1
    },
    displayRotation: 270,
    rotation: 90,
    flipH: false,
    flipV: false
  })
})

test('video metadata() in pipeline', async (t) => {
  const path = './test/fixtures/orientation.mov'

  const metadata = await video(path).metadata()
  const constants = await video.getConstants()

  t.is(metadata.width, 120)
  t.is(metadata.height, 160)
  t.is(metadata.codec.id, constants.codecs.H264)
  t.is(metadata.codec.name, 'h264')
  t.is(metadata.duration, 10)
  t.is(metadata.displayRotation, 270)
  t.is(metadata.rotation, 90)
  t.is(metadata.flipH, false)
  t.is(metadata.flipV, false)
})

test('video metadata() finds duration in the stream', async (t) => {
  const path = './test/fixtures/duration-stream.mp4'

  const metadata = await video(path).metadata()
  const constants = await video.getConstants()

  t.is(metadata.duration, 2)
  t.is(metadata.width, 64)
  t.is(metadata.height, 64)
  t.is(metadata.codec.id, constants.codecs.H264)
  t.is(metadata.codec.name, 'h264')
  t.is(metadata.displayRotation, 0)
  t.is(metadata.rotation, 0)
  t.is(metadata.flipH, false)
  t.is(metadata.flipV, false)
})

test('video metadata() finds duration in the container', async (t) => {
  const path = './test/fixtures/duration-container.mkv'

  const metadata = await video(path).metadata()
  const constants = await video.getConstants()

  t.is(metadata.duration, 2)
  t.is(metadata.width, 64)
  t.is(metadata.height, 64)
  t.is(metadata.codec.id, constants.codecs.H264)
  t.is(metadata.codec.name, 'h264')
  t.is(metadata.displayRotation, 0)
  t.is(metadata.rotation, 0)
  t.is(metadata.flipH, false)
  t.is(metadata.flipV, false)
})

test('video metadata() defaults', async (t) => {
  const path = './test/fixtures/sample.mp4'

  const metadata = await video(path).metadata()

  t.is(metadata.codec.name, 'h264')
  t.is(metadata.displayRotation, 0)
  t.is(metadata.rotation, 0)
  t.is(metadata.flipH, false)
  t.is(metadata.flipV, false)
})

test('parseDisplayMatrix()', (t) => {
  let transform = parseDisplayMatrix(createDisplayMatrix(1, 0, 0, 1))
  t.alike(transform, { rotation: 0, flipH: false, flipV: false })

  transform = parseDisplayMatrix(createDisplayMatrix(-1, 0, 0, 1))
  t.alike(transform, { rotation: 0, flipH: true, flipV: false })

  transform = parseDisplayMatrix(createDisplayMatrix(-0.9998, 0.0001, -0.0002, 1.0002))
  t.alike(transform, { rotation: 0, flipH: true, flipV: false })

  transform = parseDisplayMatrix(createDisplayMatrix(1, 0, 0, -1))
  t.alike(transform, { rotation: 0, flipH: false, flipV: true })

  transform = parseDisplayMatrix(createDisplayMatrix(0, 1, 1, 0))
  t.alike(transform, { rotation: 90, flipH: true, flipV: false })

  transform = parseDisplayMatrix(createDisplayMatrix(0, -1, -1, 0))
  t.alike(transform, { rotation: 90, flipH: false, flipV: true })

  transform = parseDisplayMatrix(createDisplayMatrix(0.0001, -0.9998, -1.0002, -0.0001))
  t.alike(transform, { rotation: 90, flipH: false, flipV: true })

  transform = parseDisplayMatrix(createDisplayMatrix(-1, 0, 0, -1))
  t.alike(transform, { rotation: 180, flipH: false, flipV: false })

  transform = parseDisplayMatrix(createDisplayMatrix(-1.0001, -0.0001, 0.0002, -0.9998))
  t.alike(transform, { rotation: 180, flipH: false, flipV: false })

  transform = parseDisplayMatrix(createDisplayMatrix(0, 1, -1, 0))
  t.alike(transform, { rotation: 270, flipH: false, flipV: false })

  transform = parseDisplayMatrix(createDisplayMatrix(0.0002, 0.9998, -1.0001, -0.0002))
  t.alike(transform, { rotation: 270, flipH: false, flipV: false })
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

  const totalOutputBuffer = assertChunks(t, chunks)

  // Check for MP4 header (e.g., ftyp box)
  const header = b4a.toString(totalOutputBuffer.subarray(4, 8))
  t.is(header, 'ftyp', 'Output starts with MP4 ftyp marker')
})

test('video.transcode() - preserves non-30fps video timestamps', async (t) => {
  const path = './test/fixtures/sample.webm'
  const outputPath = barePath.join(os.tmpdir(), randomFileName('mp4'))
  t.teardown(() => fs.unlinkSync(outputPath))

  const fd = fs.openSync(outputPath, 'w')
  try {
    for await (const chunk of video(path).transcode({ format: 'mp4' })) {
      fs.writeSync(fd, chunk.buffer)
    }
  } finally {
    fs.closeSync(fd)
  }

  const inputMetadata = await video(path).metadata()
  const outputMetadata = await video(outputPath).metadata()
  const durationDelta = Math.abs(outputMetadata.duration - inputMetadata.duration)

  t.is(inputMetadata.avgFramerate.numerator, 25, 'fixture uses a non-30fps frame rate')
  t.is(inputMetadata.avgFramerate.denominator, 1, 'fixture frame rate denominator is set')
  t.ok(durationDelta < 0.1, 'video duration is preserved')
})

test('video.transcode() - preserves audio/video start offset', async (t) => {
  const path = './test/fixtures/audio-offset.mkv'
  const outputPath = barePath.join(os.tmpdir(), randomFileName('mp4'))
  t.teardown(() => fs.unlinkSync(outputPath))

  const fd = fs.openSync(outputPath, 'w')
  try {
    for await (const chunk of video(path).transcode({ format: 'mp4' })) {
      fs.writeSync(fd, chunk.buffer)
    }
  } finally {
    fs.closeSync(fd)
  }

  const inputTimestamps = firstMediaPacketTimestamps(path)
  const outputTimestamps = firstMediaPacketTimestamps(outputPath)
  const inputOffset = inputTimestamps.audio - inputTimestamps.video
  const outputOffset = outputTimestamps.audio - outputTimestamps.video

  t.ok(Math.abs(inputOffset - 0.244) < 0.001, 'fixture audio starts 244ms after video')
  t.ok(Math.abs(outputOffset - inputOffset) < 0.01, 'audio start offset is preserved')
  t.ok(
    Math.abs(outputTimestamps.video - inputTimestamps.video) < 0.01,
    'video start time is preserved'
  )
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

  const totalOutputBuffer = assertChunks(t, chunks)

  // Check for WebM/EBML header
  t.is(totalOutputBuffer[0], 0x1a, 'Output starts with EBML header byte 0')
  t.is(totalOutputBuffer[1], 0x45, 'Output starts with EBML header byte 1')
  t.is(totalOutputBuffer[2], 0xdf, 'Output starts with EBML header byte 2')
  t.is(totalOutputBuffer[3], 0xa3, 'Output starts with EBML header byte 3')
})

test('video.transcode() - Skips unsupported tracks if they are secondary', async (t) => {
  const path = './test/fixtures/unsupported-secondary-audio.mov'

  const chunks = []
  for await (const chunk of video(path).transcode({
    format: 'webm',
    width: 320,
    height: 240
  })) {
    chunks.push(chunk)
  }

  const totalOutputBuffer = assertChunks(t, chunks)

  // Check for WebM/EBML header
  t.is(totalOutputBuffer[0], 0x1a, 'Output starts with EBML header byte 0')
  t.is(totalOutputBuffer[1], 0x45, 'Output starts with EBML header byte 1')
  t.is(totalOutputBuffer[2], 0xdf, 'Output starts with EBML header byte 2')
  t.is(totalOutputBuffer[3], 0xa3, 'Output starts with EBML header byte 3')
})

test('video.transcode() - Throws if an unsupported track is primary', async (t) => {
  const path = './test/fixtures/unsupported-primary-audio.mov'

  await t.exception(async () => {
    for await (const chunk of video(path).transcode({
      format: 'webm',
      width: 320,
      height: 240
    })) {
      // throws
    }
  }, /Input audio stream is not decodable/)
})

// The decoder is already open when the encoder is created, and the encoder is
// only owned by its caller once returned, so an encoder that fails to open could
// leak both. 65536x65536 exceeds ffmpeg's pixel limit, which is enough to make
// avcodec_open2 reject it.
test('video.transcode() - releases both codecs when the encoder fails to open', async (t) => {
  const path = './test/fixtures/sample.mp4'

  await t.exception(async () => {
    for await (const chunk of video(path).transcode({
      format: 'webm',
      width: 65536,
      height: 65536
    })) {
      // throws
    }
  }, /Invalid argument/)
})

test('video.transcode() - mp4 to webm has metadata', async (t) => {
  const path = './test/fixtures/sample.mp4'
  const outputPath = barePath.join(os.tmpdir(), randomFileName('webm'))
  t.teardown(() => fs.unlinkSync(outputPath))

  const fd = fs.openSync(outputPath, 'w')
  try {
    for await (const chunk of video(path).transcode({ format: 'webm' })) {
      fs.writeSync(fd, chunk.buffer)
    }
  } finally {
    fs.closeSync(fd)
  }

  const metadata = await video(outputPath).metadata()
  const constants = await video.getConstants()

  t.is(metadata.width, 320, 'width is set')
  t.is(metadata.height, 240, 'height is set')
  t.is(metadata.codec.id, constants.codecs.VP9, 'codec is VP9')
  t.is(metadata.codec.name, 'vp9', 'codec name is set')
  t.is(metadata.avgFramerate.numerator, 25, 'framerate numerator is set')
  t.is(metadata.avgFramerate.denominator, 1, 'framerate denominator is set')
  t.is(metadata.duration, 4, 'duration is set')
  t.is(metadata.displayRotation, 0, 'rotation is set')
})

// One fixture per display-matrix transform. All are byte-identical to
// orientation.mov except for the rotation/reflection cells of the tkhd
// display matrix.
const orientationFixtures = [
  'orientation.mov', // display rotation 270
  'orientation-identity.mov', // identity matrix, no filter applied
  'orientation-90.mov',
  'orientation-180.mov',
  'orientation-hflip.mov',
  'orientation-vflip.mov',
  'orientation-90-hflip.mov',
  'orientation-90-vflip.mov'
]

for (const fixture of orientationFixtures) {
  test(`video.transcode() - bakes display orientation into pixels (${fixture})`, async (t) => {
    const path = `./test/fixtures/${fixture}`
    const outputPath = barePath.join(os.tmpdir(), randomFileName('webm'))
    t.teardown(() => fs.unlinkSync(outputPath))

    const inputMetadata = await video(path).metadata()
    const inputFrame = await video(path).extractFrames({ frameIndex: 0 })
    const expectedFrame = await image.orientate(inputFrame, {
      transform: {
        rotate: inputMetadata.rotation,
        flipH: inputMetadata.flipH,
        flipV: inputMetadata.flipV
      }
    })

    const fd = fs.openSync(outputPath, 'w')
    try {
      for await (const chunk of video(path).transcode({ format: 'webm' })) {
        fs.writeSync(fd, chunk.buffer)
      }
    } finally {
      fs.closeSync(fd)
    }

    const outputMetadata = await video(outputPath).metadata()
    const outputFrame = await video(outputPath).extractFrames({ frameIndex: 0 })
    const pixelError = meanAbsolutePixelError(outputFrame, expectedFrame)

    t.is(outputMetadata.displayRotation, 0, 'display rotation metadata is cleared')
    t.is(outputMetadata.rotation, 0, 'corrective rotation metadata is cleared')
    t.is(outputMetadata.flipH, false, 'horizontal flip metadata is cleared')
    t.is(outputMetadata.flipV, false, 'vertical flip metadata is cleared')
    t.alike(
      { width: outputFrame.width, height: outputFrame.height },
      { width: expectedFrame.width, height: expectedFrame.height },
      'output frame has the transformed dimensions'
    )
    t.ok(pixelError < 5, `output pixels match the expected orientation (${pixelError.toFixed(2)})`)
  })
}

test('video.transcode() - drains delayed decoder frames at end of input', async (t) => {
  const path = './test/fixtures/orientation.mov'
  const outputPath = barePath.join(os.tmpdir(), randomFileName('webm'))
  t.teardown(() => fs.unlinkSync(outputPath))

  const inputFrames = countVideoFrames(path)

  const fd = fs.openSync(outputPath, 'w')
  try {
    for await (const chunk of video(path).transcode({ format: 'webm' })) {
      fs.writeSync(fd, chunk.buffer)
    }
  } finally {
    fs.closeSync(fd)
  }

  const outputFrames = countVideoFrames(outputPath)

  t.is(outputFrames, inputFrames, `output contains all ${inputFrames} input frames`)
})

test('video.transcode() - mp4 to webm with stereo', async (t) => {
  const path = './test/fixtures/sample-stereo.mp4'

  const chunks = []
  for await (const chunk of video(path).transcode({
    format: 'webm',
    width: 320,
    height: 240
  })) {
    chunks.push(chunk)
  }

  const totalOutputBuffer = assertChunks(t, chunks)

  // Check for WebM/EBML header
  t.is(totalOutputBuffer[0], 0x1a, 'Output starts with EBML header byte 0')
  t.is(totalOutputBuffer[1], 0x45, 'Output starts with EBML header byte 1')
  t.is(totalOutputBuffer[2], 0xdf, 'Output starts with EBML header byte 2')
  t.is(totalOutputBuffer[3], 0xa3, 'Output starts with EBML header byte 3')
})

test('video.transcode() - mkv to webm with 6 channel (5.1) audio', async (t) => {
  const path = './test/fixtures/sample-6-ac.mkv'

  const buffers = []
  for await (const chunk of video(path).transcode({
    format: 'webm',
    width: 320,
    height: 240
  })) {
    buffers.push(chunk.buffer)
  }

  const totalOutputBuffer = b4a.concat(buffers)
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

  const totalOutputBuffer = assertChunks(t, chunks)

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

  const totalOutputBuffer = assertChunks(t, chunks)

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
  t.ok(isValidTime(first.value.time), 'First chunk has a valid time')

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
  t.is(webmVideo.encoder, 'libvpx-vp9', 'webm video encoder is libvpx-vp9')
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
  const registry = await video.getFormatRegistry()
  const constants = await video.getConstants()

  registry.register('mp4-ios', {
    video: {
      id: constants.codecs.H264,
      format: constants.pixelFormats.YUV420P,
      encoder: 'h264_videotoolbox'
    },
    audio: {
      id: constants.codecs.AAC,
      format: constants.sampleFormats.FLTP,
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

function firstMediaPacketTimestamps(path) {
  const fd = fs.openSync(path, 'r')
  const io = createIOContext(fd, ffmpeg)
  using format = new ffmpeg.InputFormatContext(io)
  const packet = new ffmpeg.Packet()
  const timestamps = {}

  try {
    while (format.readFrame(packet)) {
      const stream = format.streams[packet.streamIndex]
      const type = stream.codecParameters.type

      if (packet.pts !== -1) {
        const timestamp = (packet.pts * stream.timeBase.numerator) / stream.timeBase.denominator

        if (type === ffmpeg.constants.mediaTypes.VIDEO && timestamps.video === undefined) {
          timestamps.video = timestamp
        } else if (type === ffmpeg.constants.mediaTypes.AUDIO && timestamps.audio === undefined) {
          timestamps.audio = timestamp
        }
      }

      packet.unref()
      if (timestamps.video !== undefined && timestamps.audio !== undefined) break
    }
  } finally {
    packet.destroy()
    fs.closeSync(fd)
  }

  return timestamps
}

function meanAbsolutePixelError(actual, expected) {
  if (
    actual.width !== expected.width ||
    actual.height !== expected.height ||
    actual.data.length !== expected.data.length
  ) {
    return Infinity
  }

  let totalError = 0
  for (let i = 0; i < actual.data.length; i += 4) {
    totalError += Math.abs(actual.data[i] - expected.data[i])
    totalError += Math.abs(actual.data[i + 1] - expected.data[i + 1])
    totalError += Math.abs(actual.data[i + 2] - expected.data[i + 2])
  }

  return totalError / ((actual.data.length / 4) * 3)
}

/*
 * Count the decodable video frames in a file, flushing the decoder at EOF so
 * frames delayed by reordering are included.
 */
function countVideoFrames(path) {
  const fd = fs.openSync(path, 'r')
  const io = createIOContext(fd, ffmpeg)
  using format = new ffmpeg.InputFormatContext(io)
  const stream = format.getBestStream(ffmpeg.constants.mediaTypes.VIDEO)
  const decoder = stream.decoder()
  decoder.open()

  const packet = new ffmpeg.Packet()
  const frame = new ffmpeg.Frame()

  let count = 0

  try {
    while (format.readFrame(packet)) {
      if (packet.streamIndex === stream.index && decoder.sendPacket(packet)) {
        while (decoder.receiveFrame(frame)) count++
      }
      packet.unref()
    }

    decoder.sendPacket(packet)
    while (decoder.receiveFrame(frame)) count++
  } finally {
    packet.destroy()
    frame.destroy()
    decoder.destroy()
    fs.closeSync(fd)
  }

  return count
}

function isValidTime(time) {
  return Number.isFinite(time) && time >= 0
}

function assertChunks(t, chunks) {
  // Check buffer
  t.ok(chunks.length > 0, 'Received some chunks')
  const totalOutputBuffer = b4a.concat(chunks.map((c) => c.buffer))
  t.ok(totalOutputBuffer.length > 0, 'Total output buffer has data')

  // Check time
  let allValidTimes = true
  let allMonotonic = true
  let prevTime = 0

  for (const chunk of chunks) {
    allValidTimes &&= isValidTime(chunk.time)
    allMonotonic &&= chunk.time >= prevTime
    prevTime = chunk.time
  }

  t.ok(allValidTimes, 'Chunk times are finite and non-negative')
  t.ok(allMonotonic, 'Chunk times are monotonic')
  t.ok(prevTime > 0, 'Chunk time advances')

  return totalOutputBuffer
}
