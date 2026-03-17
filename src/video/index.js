import fs from 'bare-fs'
import { importFFmpeg } from '../codecs'
import { parseDisplayMatrix } from './display-matrix.js'

function createIOContext(fd, ffmpeg) {
  const fileSize = fs.fstatSync(fd).size
  let offset = 0

  return new ffmpeg.IOContext(4096, {
    onread: (buffer, requested) => {
      const read = fs.readSync(fd, buffer, 0, requested, offset)
      if (read === 0) return 0
      offset += read
      return read
    },
    onseek: (o, whence) => {
      if (whence === ffmpeg.constants.seek.SIZE) return fileSize
      if (whence === ffmpeg.constants.seek.SET) offset = o
      else if (whence === ffmpeg.constants.seek.CUR) offset += o
      else if (whence === ffmpeg.constants.seek.END) offset = fileSize + o
      else return -1
      return offset
    }
  })
}

async function extractFrames(fd, opts = {}) {
  const { frameIndex } = opts

  const ffmpeg = await importFFmpeg()
  const io = createIOContext(fd, ffmpeg)

  using inputFormat = new ffmpeg.InputFormatContext(io)
  const stream = inputFormat.getBestStream(ffmpeg.constants.mediaTypes.VIDEO)
  const decoder = stream.decoder()
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

  decoder.destroy()

  if (!result) {
    throw new Error(`Frame ${frameIndex} not found (video only has ${currentFrame} frames)`)
  }

  return result
}

async function metadata(fd) {
  const ffmpeg = await importFFmpeg()
  const io = createIOContext(fd, ffmpeg)

  using inputFormat = new ffmpeg.InputFormatContext(io)
  const stream = inputFormat.getBestStream(ffmpeg.constants.mediaTypes.VIDEO)

  if (!stream) throw new Error('No video stream found')

  let displayRotation = 0
  let correctiveRotation = 0
  let flipH = false
  let flipV = false

  for (const entry of stream.sideData) {
    if (entry.type === ffmpeg.constants.packetSideDataType.DISPLAYMATRIX) {
      const transform = parseDisplayMatrix(entry.data)
      if (transform) {
        displayRotation = transform.rotation
        flipH = transform.flipH
        flipV = transform.flipV
      }
      break
    }
  }

  correctiveRotation = ((-displayRotation % 360) + 360) % 360

  return {
    width: stream.codecParameters.width,
    height: stream.codecParameters.height,
    duration: stream.duration,
    avgFramerate: {
      numerator: stream.avgFramerate.numerator,
      denominator: stream.avgFramerate.denominator
    },
    displayRotation,
    rotation: correctiveRotation,
    flipH,
    flipV
  }
}

async function* transcode(fd, opts = {}) {
  const { Transcoder } = await import('./transcoder.js')

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
  const { formatRegistry } = await import('./transcoder.js')
  return formatRegistry
}

video.extractFrames = extractFrames
video.metadata = metadata
video.transcode = transcode
video.getFormatRegistry = getFormatRegistry

export { video }
