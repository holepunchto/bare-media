import fs from 'bare-fs'
import b4a from 'b4a'
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
    const fd = fs.openSync(this.input, 'r')
    const result = extractFrames(fd, opts)
    fs.closeSync(fd)
    return result
  }

  async *transcode(opts) {
    const fd = fs.openSync(this.input, 'r')
    try {
      // Adapt user-friendly API to internal format
      const { format, width, height, bufferSize } = opts
      const internalOpts = {
        outputParameters: { format, width, height },
        bufferSize
      }
      for await (const chunk of transcode(fd, internalOpts)) {
        yield chunk
      }
    } finally {
      fs.closeSync(fd)
    }
  }
}

function video(input) {
  return new VideoPipeline(input)
}

video.extractFrames = extractFrames

function encodeAndWrite(encoder, frame, outputStream, outputFormat, packet) {
  if (encoder.sendFrame(frame)) {
    while (encoder.receivePacket(packet)) {
      packet.streamIndex = outputStream.index
      packet.rescaleTimestamps(encoder.timeBase, outputStream.timeBase)
      outputFormat.writeFrame(packet)
      packet.unref()
    }
  }
}

async function* transcode(fd, opts = {}) {
  const { outputParameters = {}, bufferSize = 32 * 1024 } = opts

  const chunks = []
  const fileSize = fs.fstatSync(fd).size
  let offset = 0

  const inIO = new ffmpeg.IOContext(4096, {
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

  const inputFormatContext = new ffmpeg.InputFormatContext(inIO)
  const outIO = new ffmpeg.IOContext(bufferSize, {
    onwrite: (chunk) => {
      chunks.push(b4a.from(chunk))
      return chunk.length
    }
  })

  const outputFormatName = outputParameters?.format || 'mp4'
  const outputFormat = new ffmpeg.OutputFormatContext(outputFormatName, outIO)

  const streamMapping = []
  for (const inputStream of inputFormatContext.streams) {
    const codecType = inputStream.codecParameters.type

    if (
      codecType !== ffmpeg.constants.mediaTypes.VIDEO &&
      codecType !== ffmpeg.constants.mediaTypes.AUDIO
    ) {
      continue
    }

    const decoderContext = inputStream.decoder()
    try {
      decoderContext.open()
    } catch (err) {
      console.warn(`Failed to open decoder for stream ${inputStream.index}: ${err.message}`)
      decoderContext.destroy()
      continue
    }

    const outputStream = outputFormat.createStream()

    if (codecType === ffmpeg.constants.mediaTypes.VIDEO) {
      outputStream.codecParameters.type = ffmpeg.constants.mediaTypes.VIDEO

      switch (outputFormatName) {
        case 'webm':
          outputStream.codecParameters.id = ffmpeg.constants.codecs.VP8
          outputStream.codecParameters.format = ffmpeg.constants.pixelFormats.YUV420P
          break
        case 'mp4':
        case 'matroska':
        case 'mkv':
          outputStream.codecParameters.id = ffmpeg.constants.codecs.VP9
          outputStream.codecParameters.format = ffmpeg.constants.pixelFormats.YUV420P
          break
        default:
          throw new Error(`Unsupported video output format: ${outputFormatName}`)
      }

      const width = outputParameters?.width || decoderContext.width
      const height = outputParameters?.height || decoderContext.height
      outputStream.codecParameters.width = width
      outputStream.codecParameters.height = height

      outputStream.timeBase = new ffmpeg.Rational(1, 90000)
    } else if (codecType === ffmpeg.constants.mediaTypes.AUDIO) {
      outputStream.codecParameters.type = ffmpeg.constants.mediaTypes.AUDIO

      let targetSampleRate = decoderContext.sampleRate

      switch (outputFormatName) {
        case 'webm':
        case 'mp4':
        case 'matroska':
        case 'mkv':
          outputStream.codecParameters.id = ffmpeg.constants.codecs.OPUS
          outputStream.codecParameters.format = ffmpeg.constants.sampleFormats.FLTP
          targetSampleRate = 48000
          break
        default:
          throw new Error(`Unsupported audio output format: ${outputFormatName}`)
      }

      outputStream.codecParameters.sampleRate = targetSampleRate
      outputStream.codecParameters.channelLayout = decoderContext.channelLayout
      outputStream.timeBase = new ffmpeg.Rational(1, targetSampleRate)
    }

    let encoderName
    if (codecType === ffmpeg.constants.mediaTypes.VIDEO) {
      switch (outputFormatName) {
        case 'webm':
          encoderName = 'libvpx'
          break
        case 'mp4':
        case 'matroska':
        case 'mkv':
          encoderName = 'libvpx-vp9'
          break
        default:
          throw new Error(`No encoder configured for video format: ${outputFormatName}`)
      }
    } else if (codecType === ffmpeg.constants.mediaTypes.AUDIO) {
      encoderName = 'libopus'
    }

    const softwareEncoder = new ffmpeg.Encoder(encoderName)
    const encoder = new ffmpeg.CodecContext(softwareEncoder)
    outputStream.codecParameters.toContext(encoder)

    if (codecType === ffmpeg.constants.mediaTypes.VIDEO) {
      encoder.timeBase = outputStream.timeBase
      encoder.width = outputStream.codecParameters.width
      encoder.height = outputStream.codecParameters.height
      encoder.pixelFormat = outputStream.codecParameters.format

      if (decoderContext.frameRate && decoderContext.frameRate.valid) {
        encoder.frameRate = decoderContext.frameRate
      } else {
        encoder.frameRate = new ffmpeg.Rational(30, 1)
      }
      encoder.gopSize = 30
    } else if (codecType === ffmpeg.constants.mediaTypes.AUDIO) {
      encoder.timeBase = outputStream.timeBase
      encoder.sampleRate = outputStream.codecParameters.sampleRate
      encoder.channelLayout = outputStream.codecParameters.channelLayout
      encoder.sampleFormat = outputStream.codecParameters.format
    }

    if (outputFormat.outputFormat.flags & ffmpeg.constants.formatFlags.GLOBALHEADER) {
      encoder.flags |= ffmpeg.constants.codecFlags.GLOBAL_HEADER
    }

    const encoderOptions = new ffmpeg.Dictionary()
    if (codecType === ffmpeg.constants.mediaTypes.VIDEO) {
      encoderOptions.set('allow_sw', '1')
    }

    try {
      encoder.open(encoderOptions)
    } catch (err) {
      encoder.destroy()
      decoderContext.destroy()
      inputFormatContext.destroy()
      outputFormat.destroy()

      throw new Error(
        `Failed to open ${codecType === ffmpeg.constants.mediaTypes.VIDEO ? 'video' : 'audio'} encoder: ${err.message}\n` +
          `Stream: ${inputStream.index}, Format: ${outputFormatName}`
      )
    }

    outputStream.codecParameters.fromContext(encoder)

    streamMapping[inputStream.index] = {
      inputStream,
      outputStream,
      decoder: decoderContext,
      encoder,
      rescaler: null,
      resampler: null,
      fifo: null,
      fifoFrame: null,
      totalSamplesOutput: 0,
      nextVideoPts: 0
    }
  }

  const muxerOptions = new ffmpeg.Dictionary()

  switch (outputFormatName) {
    case 'mp4':
      muxerOptions.set('movflags', 'frag_keyframe+empty_moov+default_base_moof')
      break
    case 'webm':
      muxerOptions.set('live', '1')
      break
    case 'matroska':
    case 'mkv':
      muxerOptions.set('live', '1')
      break
  }

  outputFormat.writeHeader(muxerOptions)

  const packet = new ffmpeg.Packet()
  const frame = new ffmpeg.Frame()

  try {
    while (inputFormatContext.readFrame(packet)) {
      const mapping = streamMapping[packet.streamIndex]
      if (!mapping) {
        packet.unref()
        continue
      }

      const { decoder, encoder, outputStream } = mapping

      if (decoder.sendPacket(packet)) {
        while (decoder.receiveFrame(frame)) {
          if (mapping.inputStream.codecParameters.type === ffmpeg.constants.mediaTypes.VIDEO) {
            if (
              !mapping.rescaler ||
              mapping.lastWidth !== frame.width ||
              mapping.lastHeight !== frame.height ||
              mapping.lastFormat !== frame.format
            ) {
              if (mapping.rescaler) mapping.rescaler.destroy()

              mapping.rescaler = new ffmpeg.Scaler(
                frame.format,
                frame.width,
                frame.height,
                encoder.pixelFormat,
                encoder.width,
                encoder.height
              )

              mapping.lastWidth = frame.width
              mapping.lastHeight = frame.height
              mapping.lastFormat = frame.format
            }

            const outFrame = new ffmpeg.Frame()
            outFrame.format = encoder.pixelFormat
            outFrame.width = encoder.width
            outFrame.height = encoder.height
            outFrame.alloc()
            outFrame.copyProperties(frame)

            mapping.rescaler.scale(frame, outFrame)

            outFrame.pts = mapping.nextVideoPts

            const frameDuration =
              (encoder.timeBase.denominator * encoder.frameRate.denominator) /
              (encoder.timeBase.numerator * encoder.frameRate.numerator)
            mapping.nextVideoPts += frameDuration

            encodeAndWrite(encoder, outFrame, outputStream, outputFormat, packet)

            outFrame.destroy()
          } else if (
            mapping.inputStream.codecParameters.type === ffmpeg.constants.mediaTypes.AUDIO
          ) {
            if (!mapping.resampler) {
              mapping.resampler = new ffmpeg.Resampler(
                frame.sampleRate,
                frame.channelLayout,
                frame.format,
                encoder.sampleRate,
                encoder.channelLayout,
                encoder.sampleFormat
              )
            }

            if (!mapping.fifo) {
              mapping.fifo = new ffmpeg.AudioFIFO(
                encoder.sampleFormat,
                encoder.channelLayout.nbChannels,
                encoder.frameSize
              )
              mapping.fifoFrame = new ffmpeg.Frame()
              mapping.fifoFrame.format = encoder.sampleFormat
              mapping.fifoFrame.channelLayout = encoder.channelLayout
              mapping.fifoFrame.sampleRate = encoder.sampleRate
            }

            const outFrame = new ffmpeg.Frame()
            outFrame.format = encoder.sampleFormat
            outFrame.channelLayout = encoder.channelLayout
            outFrame.sampleRate = encoder.sampleRate

            const outSamples =
              Math.ceil((frame.nbSamples * encoder.sampleRate) / frame.sampleRate) + 32
            outFrame.nbSamples = outSamples
            outFrame.alloc()

            const converted = mapping.resampler.convert(frame, outFrame)
            outFrame.nbSamples = converted

            mapping.fifo.write(outFrame)
            outFrame.destroy()

            const frameSize = encoder.frameSize

            while (mapping.fifo.size >= frameSize) {
              mapping.fifoFrame.nbSamples = frameSize
              mapping.fifoFrame.alloc()

              mapping.fifo.read(mapping.fifoFrame, frameSize)

              mapping.fifoFrame.pts = mapping.totalSamplesOutput
              mapping.totalSamplesOutput += mapping.fifoFrame.nbSamples

              encodeAndWrite(encoder, mapping.fifoFrame, outputStream, outputFormat, packet)
            }
          }
        }
      }
      packet.unref()
    }

    for (const index in streamMapping) {
      const mapping = streamMapping[index]

      if (mapping.fifo && mapping.fifo.size > 0) {
        const remaining = mapping.fifo.size
        mapping.fifoFrame.nbSamples = remaining
        mapping.fifoFrame.alloc()
        mapping.fifo.read(mapping.fifoFrame, remaining)
        mapping.fifoFrame.pts = mapping.totalSamplesOutput
        mapping.totalSamplesOutput += mapping.fifoFrame.nbSamples
        encodeAndWrite(
          mapping.encoder,
          mapping.fifoFrame,
          mapping.outputStream,
          outputFormat,
          packet
        )
      }

      encodeAndWrite(mapping.encoder, null, mapping.outputStream, outputFormat, packet)
    }

    outputFormat.writeTrailer()
  } finally {
    packet.destroy()
    frame.destroy()

    for (const index in streamMapping) {
      const m = streamMapping[index]
      m.decoder.destroy()
      m.encoder.destroy()
      if (m.rescaler) m.rescaler.destroy()
      if (m.resampler) m.resampler.destroy()
      if (m.fifo) m.fifo.destroy()
      if (m.fifoFrame) m.fifoFrame.destroy()
    }

    inputFormatContext.destroy()
    outputFormat.destroy()
  }

  for (const chunk of chunks) {
    yield { buffer: chunk }
  }
}

export { video }
