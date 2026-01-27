import fs from 'bare-fs'
import b4a from 'b4a'
import ffmpeg from 'bare-ffmpeg'

const { VIDEO, AUDIO } = ffmpeg.constants.mediaTypes

const VIDEO_CODEC_CONFIG = {
  webm: {
    id: ffmpeg.constants.codecs.VP8,
    format: ffmpeg.constants.pixelFormats.YUV420P,
    encoder: 'libvpx'
  },
  mp4: {
    id: ffmpeg.constants.codecs.VP9,
    format: ffmpeg.constants.pixelFormats.YUV420P,
    encoder: 'libvpx-vp9'
  },
  matroska: {
    id: ffmpeg.constants.codecs.VP9,
    format: ffmpeg.constants.pixelFormats.YUV420P,
    encoder: 'libvpx-vp9'
  },
  mkv: {
    id: ffmpeg.constants.codecs.VP9,
    format: ffmpeg.constants.pixelFormats.YUV420P,
    encoder: 'libvpx-vp9'
  }
}

const AUDIO_CODEC_CONFIG = {
  webm: {
    id: ffmpeg.constants.codecs.OPUS,
    format: ffmpeg.constants.sampleFormats.FLTP,
    sampleRate: 48000,
    encoder: 'libopus'
  },
  mp4: {
    id: ffmpeg.constants.codecs.OPUS,
    format: ffmpeg.constants.sampleFormats.FLTP,
    sampleRate: 48000,
    encoder: 'libopus'
  },
  matroska: {
    id: ffmpeg.constants.codecs.OPUS,
    format: ffmpeg.constants.sampleFormats.FLTP,
    sampleRate: 48000,
    encoder: 'libopus'
  },
  mkv: {
    id: ffmpeg.constants.codecs.OPUS,
    format: ffmpeg.constants.sampleFormats.FLTP,
    sampleRate: 48000,
    encoder: 'libopus'
  }
}

const MUXER_OPTIONS = {
  mp4: { movflags: 'frag_keyframe+empty_moov+default_base_moof' },
  webm: { live: '1' },
  matroska: { live: '1' },
  mkv: { live: '1' }
}

class TranscodeStreamConfig {
  constructor(inputStream, outputFormat, outputFormatName, outputParameters) {
    this.inputStream = inputStream
    this.outputFormat = outputFormat
    this.outputFormatName = outputFormatName
    this.outputParameters = outputParameters
    this.codecType = inputStream.codecParameters.type
  }

  isVideo() {
    return this.codecType === VIDEO
  }

  isAudio() {
    return this.codecType === AUDIO
  }

  getConfig() {
    const config = this.isVideo()
      ? VIDEO_CODEC_CONFIG[this.outputFormatName]
      : AUDIO_CODEC_CONFIG[this.outputFormatName]

    if (!config) {
      throw new Error(
        `Unsupported ${this.isVideo() ? 'video' : 'audio'} output format: ${this.outputFormatName}`
      )
    }
    return config
  }

  create() {
    const decoder = this._createDecoder()
    if (!decoder) return null

    const outputStream = this.outputFormat.createStream()
    this._configureOutputStream(outputStream, decoder)

    const encoder = this._createEncoder(outputStream, decoder)
    outputStream.codecParameters.fromContext(encoder)

    return {
      inputStream: this.inputStream,
      outputStream,
      decoder,
      encoder,
      rescaler: null,
      resampler: null,
      fifo: null,
      fifoFrame: null,
      totalSamplesOutput: 0,
      nextVideoPts: 0
    }
  }

  _createDecoder() {
    const decoderContext = this.inputStream.decoder()
    try {
      decoderContext.open()
      return decoderContext
    } catch (err) {
      console.warn(`Failed to open decoder for stream ${this.inputStream.index}: ${err.message}`)
      decoderContext.destroy()
      return null
    }
  }

  _configureOutputStream(outputStream, decoder) {
    const config = this.getConfig()

    outputStream.codecParameters.type = this.codecType
    outputStream.codecParameters.id = config.id
    outputStream.codecParameters.format = config.format

    if (this.isVideo()) {
      outputStream.codecParameters.width = this.outputParameters?.width || decoder.width
      outputStream.codecParameters.height = this.outputParameters?.height || decoder.height
      outputStream.timeBase = new ffmpeg.Rational(1, 90000)
    } else {
      outputStream.codecParameters.sampleRate = config.sampleRate
      outputStream.codecParameters.channelLayout = decoder.channelLayout
      outputStream.timeBase = new ffmpeg.Rational(1, config.sampleRate)
    }
  }

  _createEncoder(outputStream, decoder) {
    const config = this.getConfig()
    const encoder = new ffmpeg.CodecContext(new ffmpeg.Encoder(config.encoder))
    outputStream.codecParameters.toContext(encoder)

    if (this.isVideo()) {
      this._configureVideoEncoder(encoder, outputStream, decoder)
    } else {
      this._configureAudioEncoder(encoder, outputStream)
    }

    if (this.outputFormat.outputFormat.flags & ffmpeg.constants.formatFlags.GLOBALHEADER) {
      encoder.flags |= ffmpeg.constants.codecFlags.GLOBAL_HEADER
    }

    const encoderOptions = new ffmpeg.Dictionary()
    if (this.isVideo()) {
      encoderOptions.set('allow_sw', '1')
    }

    encoder.open(encoderOptions)
    return encoder
  }

  _configureVideoEncoder(encoder, outputStream, decoder) {
    encoder.timeBase = outputStream.timeBase
    encoder.width = outputStream.codecParameters.width
    encoder.height = outputStream.codecParameters.height
    encoder.pixelFormat = outputStream.codecParameters.format

    if (decoder.frameRate && decoder.frameRate.valid) {
      encoder.frameRate = decoder.frameRate
    } else {
      encoder.frameRate = new ffmpeg.Rational(30, 1)
    }
    encoder.gopSize = 30
  }

  _configureAudioEncoder(encoder, outputStream) {
    encoder.timeBase = outputStream.timeBase
    encoder.sampleRate = outputStream.codecParameters.sampleRate
    encoder.channelLayout = outputStream.codecParameters.channelLayout
    encoder.sampleFormat = outputStream.codecParameters.format
  }
}

class VideoFrameProcessor {
  constructor(transcoder) {
    this.transcoder = transcoder
  }

  process(frame, mapping, packet) {
    const { encoder, outputStream } = mapping

    // Lazy initialize or recreate scaler if frame properties changed
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

    this.transcoder._encodeAndWrite(encoder, outFrame, outputStream, packet)

    outFrame.destroy()
  }
}

class AudioFrameProcessor {
  constructor(transcoder) {
    this.transcoder = transcoder
  }

  process(frame, mapping, packet) {
    const { encoder, outputStream } = mapping

    // Lazy initialize resampler
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

    // Lazy initialize FIFO buffer
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

    const outSamples = Math.ceil((frame.nbSamples * encoder.sampleRate) / frame.sampleRate) + 32
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

      this.transcoder._encodeAndWrite(encoder, mapping.fifoFrame, outputStream, packet)
    }
  }

  flush(mapping, packet) {
    if (mapping.fifo && mapping.fifo.size > 0) {
      const remaining = mapping.fifo.size
      mapping.fifoFrame.nbSamples = remaining
      mapping.fifoFrame.alloc()
      mapping.fifo.read(mapping.fifoFrame, remaining)
      mapping.fifoFrame.pts = mapping.totalSamplesOutput
      mapping.totalSamplesOutput += mapping.fifoFrame.nbSamples
      this.transcoder._encodeAndWrite(
        mapping.encoder,
        mapping.fifoFrame,
        mapping.outputStream,
        packet
      )
    }
  }
}

class Transcoder {
  constructor(fd, opts = {}) {
    this.fd = fd
    this.outputParameters = opts.outputParameters || {}
    this.bufferSize = opts.bufferSize || 32 * 1024

    this.chunks = []
    this.inputFormatContext = null
    this.outputFormat = null
    this.streamMapping = []
    this.outputFormatName = null

    this.videoProcessor = new VideoFrameProcessor(this)
    this.audioProcessor = new AudioFrameProcessor(this)
  }

  async *transcode() {
    try {
      this._setupIOContexts()
      this._discoverAndMapStreams()
      this._configureOutput()
      this._processFrames()
      this._finalize()
    } finally {
      this._cleanup()
    }

    for (const chunk of this.chunks) {
      yield { buffer: chunk }
    }
  }

  _setupIOContexts() {
    const fileSize = fs.fstatSync(this.fd).size
    let offset = 0

    const inIO = new ffmpeg.IOContext(4096, {
      onread: (buffer, requested) => {
        const read = fs.readSync(this.fd, buffer, 0, requested, offset)
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

    this.inputFormatContext = new ffmpeg.InputFormatContext(inIO)

    const outIO = new ffmpeg.IOContext(this.bufferSize, {
      onwrite: (chunk) => {
        this.chunks.push(b4a.from(chunk))
        return chunk.length
      }
    })

    this.outputFormatName = this.outputParameters?.format || 'mp4'
    this.outputFormat = new ffmpeg.OutputFormatContext(this.outputFormatName, outIO)
  }

  _discoverAndMapStreams() {
    for (const inputStream of this.inputFormatContext.streams) {
      const codecType = inputStream.codecParameters.type

      if (codecType !== VIDEO && codecType !== AUDIO) {
        continue
      }

      const config = new TranscodeStreamConfig(
        inputStream,
        this.outputFormat,
        this.outputFormatName,
        this.outputParameters
      )

      const mapping = config.create()
      if (mapping) {
        this.streamMapping[inputStream.index] = mapping
      }
    }
  }

  _configureOutput() {
    const muxerOptions = new ffmpeg.Dictionary()
    const options = MUXER_OPTIONS[this.outputFormatName]

    if (options) {
      for (const [key, value] of Object.entries(options)) {
        muxerOptions.set(key, value)
      }
    }

    this.outputFormat.writeHeader(muxerOptions)
  }

  _processFrames() {
    const packet = new ffmpeg.Packet()
    const frame = new ffmpeg.Frame()

    try {
      while (this.inputFormatContext.readFrame(packet)) {
        const mapping = this.streamMapping[packet.streamIndex]
        if (!mapping) {
          packet.unref()
          continue
        }

        const { decoder } = mapping

        if (decoder.sendPacket(packet)) {
          while (decoder.receiveFrame(frame)) {
            if (mapping.inputStream.codecParameters.type === VIDEO) {
              this.videoProcessor.process(frame, mapping, packet)
            } else if (mapping.inputStream.codecParameters.type === AUDIO) {
              this.audioProcessor.process(frame, mapping, packet)
            }
          }
        }
        packet.unref()
      }
    } finally {
      packet.destroy()
      frame.destroy()
    }
  }

  _finalize() {
    const packet = new ffmpeg.Packet()

    try {
      for (const index in this.streamMapping) {
        const mapping = this.streamMapping[index]
        this.audioProcessor.flush(mapping, packet)

        this._encodeAndWrite(mapping.encoder, null, mapping.outputStream, packet)
      }

      this.outputFormat.writeTrailer()
    } finally {
      packet.destroy()
    }
  }

  _cleanup() {
    for (const index in this.streamMapping) {
      const m = this.streamMapping[index]
      m.decoder.destroy()
      m.encoder.destroy()
      if (m.rescaler) m.rescaler.destroy()
      if (m.resampler) m.resampler.destroy()
      if (m.fifo) m.fifo.destroy()
      if (m.fifoFrame) m.fifoFrame.destroy()
    }

    if (this.inputFormatContext) this.inputFormatContext.destroy()
    if (this.outputFormat) this.outputFormat.destroy()
  }

  _encodeAndWrite(encoder, frame, outputStream, packet) {
    if (encoder.sendFrame(frame)) {
      while (encoder.receivePacket(packet)) {
        packet.streamIndex = outputStream.index
        packet.rescaleTimestamps(encoder.timeBase, outputStream.timeBase)
        this.outputFormat.writeFrame(packet)
        packet.unref()
      }
    }
  }
}

export { Transcoder }
