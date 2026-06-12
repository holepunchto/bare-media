import fs from 'bare-fs'
import { importFFmpeg } from './codecs'
import { createIOContext } from './video/io'
import { metadata } from './video/metadata'

async function extractFrames(fd, opts = {}) {
  const { frameIndex } = opts

  const ffmpeg = await importFFmpeg()
  const io = createIOContext(fd, ffmpeg)

  using inputFormat = new ffmpeg.InputFormatContext(io)
  const stream = inputFormat.getBestStream(ffmpeg.constants.mediaTypes.VIDEO)
  using decoder = stream.decoder()
  decoder.open()

  using packet = new ffmpeg.Packet()
  using frame = new ffmpeg.Frame()

  let currentFrame = 0
  let result = null

  while (inputFormat.readFrame(packet)) {
    if (packet.streamIndex === stream.index) {
      if (decoder.sendPacket(packet)) {
        while (decoder.receiveFrame(frame)) {
          if (currentFrame === frameIndex) {
            // Convert to RGBA
            using scaler = new ffmpeg.Scaler(
              frame.format,
              frame.width,
              frame.height,
              ffmpeg.constants.pixelFormats.RGBA,
              frame.width,
              frame.height
            )

            using rgbaFrame = new ffmpeg.Frame()
            rgbaFrame.width = frame.width
            rgbaFrame.height = frame.height
            rgbaFrame.format = ffmpeg.constants.pixelFormats.RGBA
            rgbaFrame.alloc()

            scaler.scale(frame, rgbaFrame)

            const image = new ffmpeg.Image(
              ffmpeg.constants.pixelFormats.RGBA,
              rgbaFrame.width,
              rgbaFrame.height
            )
            image.read(rgbaFrame)

            result = {
              width: rgbaFrame.width,
              height: rgbaFrame.height,
              data: image.data
            }
            break
          }
          currentFrame++
        }
      }
    }
    packet.unref()
    if (result) break
  }

  if (!result) {
    throw new Error(`Frame ${frameIndex} not found (video only has ${currentFrame} frames)`)
  }

  return result
}

async function* transcode(fd, opts = {}) {
  const { Transcoder } = await import('./video/transcoder')

  const transcoder = new Transcoder(fd, {
    outputParameters: {
      format: opts.format,
      width: opts.width,
      height: opts.height
    },
    bufferSize: opts.bufferSize
  })

  yield* transcoder.transcode()
}

class VideoPipeline {
  constructor(input) {
    this.input = input
    this.steps = []
  }

  async extractFrames(opts) {
    let fd
    let result

    try {
      fd = fs.openSync(this.input, 'r')
      result = await extractFrames(fd, opts)
    } finally {
      fs.closeSync(fd)
    }

    return result
  }

  async metadata() {
    let fd
    let result

    try {
      fd = fs.openSync(this.input, 'r')
      result = await metadata(fd)
    } finally {
      fs.closeSync(fd)
    }

    return result
  }

  async *transcode(opts) {
    const fd = fs.openSync(this.input, 'r')
    try {
      yield* transcode(fd, opts)
    } finally {
      fs.closeSync(fd)
    }
  }
}

function video(input) {
  return new VideoPipeline(input)
}

async function getFormatRegistry() {
  const { formatRegistry } = await import('./video/transcoder')
  return formatRegistry
}

async function getConstants() {
  const ffmpeg = await import('bare-ffmpeg')
  return ffmpeg.constants
}

video.extractFrames = extractFrames
video.metadata = metadata
video.transcode = transcode
video.getFormatRegistry = getFormatRegistry
video.getConstants = getConstants

export { video }
