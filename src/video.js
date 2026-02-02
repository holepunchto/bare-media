import fs from 'bare-fs'
import ffmpeg from 'bare-ffmpeg'

function extractFrames(fd, opts = {}) {
  const { frameIndex } = opts

  const fileSize = fs.fstatSync(fd).size
  let offset = 0

  const io = new ffmpeg.IOContext(4096, {
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

class VideoPipeline {
  constructor(input) {
    this.input = input
    this.steps = []
  }

  extractFrames(opts) {
    let fd
    let result

    try {
      fd = fs.openSync(this.input, 'r')
      result = extractFrames(fd, opts)
    } finally {
      fs.closeSync(fd)
    }

    return result
  }
}

function video(input) {
  return new VideoPipeline(input)
}

video.extractFrames = extractFrames

export { video }
