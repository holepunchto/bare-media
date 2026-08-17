import fs from 'bare-fs'
import b4a from 'b4a'
import ffmpeg from 'bare-ffmpeg'

import { parseDisplayMatrix } from './metadata'

const { VIDEO, AUDIO } = ffmpeg.constants.mediaTypes

class FormatRegistry {
  #formats = new Map()

  register(formatName, config) {
    this.#formats.set(formatName, {
      video: config.video,
      audio: config.audio,
      muxer: config.muxer || {}
    })
  }

  getVideoConfig(formatName) {
    const format = this.#formats.get(formatName)
    if (!format?.video) {
      throw new Error(`Unsupported video output format: ${formatName}`)
    }
    return format.video
  }

  getAudioConfig(formatName) {
    const format = this.#formats.get(formatName)
    if (!format?.audio) {
      throw new Error(`Unsupported audio output format: ${formatName}`)
    }
    return format.audio
  }

  getMuxerOptions(formatName) {
    const format = this.#formats.get(formatName)
    return format?.muxer || {}
  }

  hasFormat(formatName) {
    return this.#formats.has(formatName)
  }
}

const formatRegistry = new FormatRegistry()

formatRegistry.register('webm', {
  video: {
    id: ffmpeg.constants.codecs.VP9,
    format: ffmpeg.constants.pixelFormats.YUV420P,
    encoder: 'libvpx-vp9'
  },
  audio: {
    id: ffmpeg.constants.codecs.OPUS,
    format: ffmpeg.constants.sampleFormats.S16,
    sampleRate: 48000,
    encoder: 'libopus'
  },
  muxer: { live: '1' }
})

formatRegistry.register('mp4', {
  video: {
    id: ffmpeg.constants.codecs.VP9,
    format: ffmpeg.constants.pixelFormats.YUV420P,
    encoder: 'libvpx-vp9'
  },
  audio: {
    id: ffmpeg.constants.codecs.OPUS,
    format: ffmpeg.constants.sampleFormats.S16,
    sampleRate: 48000,
    encoder: 'libopus'
  },
  muxer: { movflags: 'frag_keyframe+delay_moov+default_base_moof' }
})

formatRegistry.register('matroska', {
  video: {
    id: ffmpeg.constants.codecs.VP9,
    format: ffmpeg.constants.pixelFormats.YUV420P,
    encoder: 'libvpx-vp9'
  },
  audio: {
    id: ffmpeg.constants.codecs.OPUS,
    format: ffmpeg.constants.sampleFormats.S16,
    sampleRate: 48000,
    encoder: 'libopus'
  },
  muxer: { live: '1' }
})

formatRegistry.register('mkv', {
  video: {
    id: ffmpeg.constants.codecs.VP9,
    format: ffmpeg.constants.pixelFormats.YUV420P,
    encoder: 'libvpx-vp9'
  },
  audio: {
    id: ffmpeg.constants.codecs.OPUS,
    format: ffmpeg.constants.sampleFormats.S16,
    sampleRate: 48000,
    encoder: 'libopus'
  },
  muxer: { live: '1' }
})

function getOrientationFilter({ rotation, flipH, flipV }) {
  if (rotation === 90) {
    if (flipH) return 'transpose=cclock_flip'
    if (flipV) return 'transpose=clock_flip'
    return 'transpose=cclock'
  }
  if (rotation === 180) return 'hflip,vflip'
  if (rotation === 270) return 'transpose=clock'
  if (flipH) return 'hflip'
  if (flipV) return 'vflip'
  return null
}

class TranscodeStreamConfig {
  static create(inputStream, outputFormatContext, containerFormat, outputParameters) {
    const config = new TranscodeStreamConfig(
      inputStream,
      outputFormatContext,
      containerFormat,
      outputParameters
    )
    return config.#initialize() ? config : null
  }

  constructor(inputStream, outputFormatContext, containerFormat, outputParameters) {
    this.inputStream = inputStream
    this.outputFormatContext = outputFormatContext
    this.containerFormat = containerFormat
    this.outputParameters = outputParameters
    this.codecType = inputStream.codecParameters.type

    this.outputStream = null
    this.decoder = null
    this.encoder = null
    this.rescaler = null
    this.resampler = null
    this.fifo = null
    this.fifoFrame = null
    this.nextAudioPts = null
    this.nextVideoPts = 0
    this.lastWidth = null
    this.lastHeight = null
    this.lastFormat = null
    this.orientation = null
    this.orientationGraph = null
    this.orientationSource = null
    this.orientationSink = null
    this.orientationFrame = null
    this.orientationWidth = null
    this.orientationHeight = null
    this.orientationFormat = null
  }

  isVideo() {
    return this.codecType === VIDEO
  }

  isAudio() {
    return this.codecType === AUDIO
  }

  getConfig() {
    return this.isVideo()
      ? formatRegistry.getVideoConfig(this.containerFormat)
      : formatRegistry.getAudioConfig(this.containerFormat)
  }

  #initialize() {
    this.decoder = this.#createDecoder()
    if (!this.decoder) return false

    // A config that fails to initialise never reaches Transcoder#configs, so
    // cleanup will never see it: release the decoder before giving up.
    try {
      if (this.isVideo()) this.orientation = this.#resolveOrientation()

      this.outputStream = this.outputFormatContext.createStream()
      this.#configureOutputStream(this.outputStream, this.decoder)

      this.encoder = this.#createEncoder(this.outputStream, this.decoder)
      this.outputStream.codecParameters.fromContext(this.encoder)
    } catch (err) {
      this.decoder.destroy()
      this.decoder = null
      throw err
    }

    return true
  }

  #resolveOrientation() {
    for (const entry of this.inputStream.sideData) {
      if (entry.type !== ffmpeg.constants.packetSideDataType.DISPLAYMATRIX) continue

      const transform = parseDisplayMatrix(entry.data)
      const filter = getOrientationFilter(transform)
      if (!filter) return null

      return {
        filter,
        swapsDimensions: transform.rotation === 90 || transform.rotation === 270
      }
    }

    return null
  }

  #createDecoder() {
    let decoderContext = null

    try {
      decoderContext = this.inputStream.decoder()
      decoderContext.open()
      return decoderContext
    } catch (err) {
      console.warn(`Failed to create decoder for stream ${this.inputStream.index}: ${err.message}`)
      if (decoderContext) decoderContext.destroy()
      return null
    }
  }

  #configureOutputStream(outputStream, decoder) {
    const config = this.getConfig()

    outputStream.codecParameters.type = this.codecType
    outputStream.codecParameters.id = config.id
    outputStream.codecParameters.format = config.format

    if (this.isVideo()) {
      const swap = this.orientation?.swapsDimensions
      const width = swap ? decoder.height : decoder.width
      const height = swap ? decoder.width : decoder.height

      outputStream.codecParameters.width = this.outputParameters?.width || width
      outputStream.codecParameters.height = this.outputParameters?.height || height
      outputStream.timeBase = new ffmpeg.Rational(1, 90000)
    } else {
      outputStream.codecParameters.sampleRate = config.sampleRate
      outputStream.codecParameters.channelLayout =
        decoder.channelLayout.nbChannels > 2
          ? ffmpeg.ChannelLayout.from(ffmpeg.constants.channelLayouts.STEREO)
          : decoder.channelLayout
      outputStream.timeBase = new ffmpeg.Rational(1, config.sampleRate)
    }
  }

  #createEncoder(outputStream, decoder) {
    const config = this.getConfig()
    const encoder = new ffmpeg.CodecContext(new ffmpeg.Encoder(config.encoder))

    // The caller only owns the encoder once it is returned, so anything that
    // throws before that has to release it.
    try {
      outputStream.codecParameters.toContext(encoder)

      if (this.isVideo()) {
        this.#configureVideoEncoder(encoder, outputStream, decoder)
      } else {
        this.#configureAudioEncoder(encoder, outputStream)
      }

      if (this.outputFormatContext.outputFormat.flags & ffmpeg.constants.formatFlags.GLOBALHEADER) {
        encoder.flags |= ffmpeg.constants.codecFlags.GLOBAL_HEADER
      }

      // avcodec_open2 only consumes the options the codec recognises; the rest
      // stay in the dictionary and are ours to free.
      using encoderOptions = this.isVideo()
        ? ffmpeg.Dictionary.from({
            allow_sw: '1',
            deadline: 'realtime',
            'cpu-used': '6',
            crf: '34',
            b: '0'
          })
        : new ffmpeg.Dictionary()

      encoder.open(encoderOptions)
    } catch (err) {
      encoder.destroy()
      throw err
    }

    return encoder
  }

  #configureVideoEncoder(encoder, outputStream, decoder) {
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

  #configureAudioEncoder(encoder, outputStream) {
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

  process(frame, config, packet) {
    if (!config.orientation) {
      this.#encodeFrame(frame, config, packet)
      return
    }

    this.#ensureOrientationFilter(frame, config)

    const err = config.orientationGraph.pushFrame(config.orientationSource, frame)
    if (err < 0) throw new Error(`Failed to push video frame into orientation filter (${err})`)

    while (
      config.orientationGraph.pullFrame(config.orientationSink, config.orientationFrame) >= 0
    ) {
      this.#encodeFrame(config.orientationFrame, config, packet)
      config.orientationFrame.unref()
    }
  }

  #ensureOrientationFilter(frame, config) {
    if (
      config.orientationGraph &&
      config.orientationWidth === frame.width &&
      config.orientationHeight === frame.height &&
      config.orientationFormat === frame.format
    ) {
      return
    }

    if (config.orientationGraph) config.orientationGraph.destroy()

    const graph = new ffmpeg.FilterGraph()
    config.orientationGraph = graph

    const source = new ffmpeg.FilterContext()
    const sink = new ffmpeg.FilterContext()
    const timeBase = config.inputStream.timeBase

    graph.createFilter(
      source,
      new ffmpeg.Filter('buffer'),
      'in',
      `video_size=${frame.width}x${frame.height}:pix_fmt=${frame.format}:time_base=${timeBase.numerator}/${timeBase.denominator}:pixel_aspect=1/1`
    )
    graph.createFilter(sink, new ffmpeg.Filter('buffersink'), 'out')

    using outputs = new ffmpeg.FilterInOut()
    outputs.name = 'in'
    outputs.filterContext = source
    outputs.padIdx = 0

    using inputs = new ffmpeg.FilterInOut()
    inputs.name = 'out'
    inputs.filterContext = sink
    inputs.padIdx = 0

    graph.parse(config.orientation.filter, inputs, outputs)
    graph.configure()

    config.orientationSource = source
    config.orientationSink = sink
    if (!config.orientationFrame) config.orientationFrame = new ffmpeg.Frame()
    config.orientationWidth = frame.width
    config.orientationHeight = frame.height
    config.orientationFormat = frame.format
  }

  #encodeFrame(frame, config, packet) {
    const { inputStream, encoder, outputStream } = config

    if (
      !config.rescaler ||
      config.lastWidth !== frame.width ||
      config.lastHeight !== frame.height ||
      config.lastFormat !== frame.format
    ) {
      if (config.rescaler) config.rescaler.destroy()

      config.rescaler = new ffmpeg.Scaler(
        frame.format,
        frame.width,
        frame.height,
        encoder.pixelFormat,
        encoder.width,
        encoder.height
      )

      config.lastWidth = frame.width
      config.lastHeight = frame.height
      config.lastFormat = frame.format
    }

    const outFrame = new ffmpeg.Frame()
    outFrame.format = encoder.pixelFormat
    outFrame.width = encoder.width
    outFrame.height = encoder.height
    outFrame.alloc()
    outFrame.copyProperties(frame)

    config.rescaler.scale(frame, outFrame)

    const frameDuration =
      (encoder.timeBase.denominator * encoder.frameRate.denominator) /
      (encoder.timeBase.numerator * encoder.frameRate.numerator)

    outFrame.pts =
      frame.pts === -1
        ? config.nextVideoPts
        : ffmpeg.Rational.rescaleQ(frame.pts, inputStream.timeBase, encoder.timeBase)
    config.nextVideoPts = outFrame.pts + frameDuration

    this.transcoder._encodeAndWrite(encoder, outFrame, outputStream, packet)

    outFrame.destroy()
  }
}

class AudioFrameProcessor {
  constructor(transcoder) {
    this.transcoder = transcoder
  }

  process(frame, config, packet) {
    const { inputStream, encoder, outputStream } = config

    if (config.nextAudioPts === null) {
      config.nextAudioPts =
        frame.pts === -1
          ? 0
          : ffmpeg.Rational.rescaleQ(frame.pts, inputStream.timeBase, encoder.timeBase)
    }

    if (!config.resampler) {
      config.resampler = new ffmpeg.Resampler(
        frame.sampleRate,
        frame.channelLayout,
        frame.format,
        encoder.sampleRate,
        encoder.channelLayout,
        encoder.sampleFormat
      )
    }

    if (!config.fifo) {
      config.fifo = new ffmpeg.AudioFIFO(
        encoder.sampleFormat,
        encoder.channelLayout.nbChannels,
        encoder.frameSize
      )
      config.fifoFrame = new ffmpeg.Frame()
    }

    const outFrame = new ffmpeg.Frame()
    outFrame.format = encoder.sampleFormat
    outFrame.channelLayout = encoder.channelLayout
    outFrame.sampleRate = encoder.sampleRate

    const outSamples = Math.ceil((frame.nbSamples * encoder.sampleRate) / frame.sampleRate) + 32
    outFrame.nbSamples = outSamples
    outFrame.alloc()

    const convertedSamples = config.resampler.convert(frame, outFrame)
    outFrame.nbSamples = convertedSamples

    config.fifo.write(outFrame)
    outFrame.destroy()

    const frameSize = encoder.frameSize
    while (config.fifo.size >= frameSize) {
      const fifoFrame = this.#readFifo(config, frameSize)
      this.transcoder._encodeAndWrite(encoder, fifoFrame, outputStream, packet)
    }
  }

  flush(config, packet) {
    if (config.fifo && config.fifo.size > 0) {
      const fifoFrame = this.#readFifo(config, config.fifo.size)
      this.transcoder._encodeAndWrite(config.encoder, fifoFrame, config.outputStream, packet)
    }
  }

  // av_frame_get_buffer() leaks if the frame still holds a buffer, so unref
  // before every realloc. Unref also resets the frame properties.
  #readFifo(config, nbSamples) {
    const { encoder, fifoFrame } = config

    fifoFrame.unref()
    fifoFrame.format = encoder.sampleFormat
    fifoFrame.channelLayout = encoder.channelLayout
    fifoFrame.sampleRate = encoder.sampleRate
    fifoFrame.nbSamples = nbSamples
    fifoFrame.alloc()

    config.fifo.read(fifoFrame, nbSamples)

    fifoFrame.pts = config.nextAudioPts
    config.nextAudioPts += fifoFrame.nbSamples

    return fifoFrame
  }
}

class Transcoder {
  constructor(fd, opts = {}) {
    this.fd = fd
    this.outputParameters = opts.outputParameters || {}
    this.bufferSize = opts.bufferSize || 32 * 1024

    this.chunks = []
    this.currentTime = 0
    this.inputFormatContext = null
    this.outputFormatContext = null
    this.configs = []
    this.containerFormat = null

    this.videoProcessor = new VideoFrameProcessor(this)
    this.audioProcessor = new AudioFrameProcessor(this)
  }

  async *transcode() {
    try {
      this.#setupIOContexts()
      this.#discoverAndConfigureStreams()
      this.#configureOutput()
      yield* this.#processFrames()
      yield* this.#finalize()
    } finally {
      this.#cleanup()
    }
  }

  #setupIOContexts() {
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

    this.containerFormat = this.outputParameters?.format || 'mp4'

    if (!formatRegistry.hasFormat(this.containerFormat)) {
      throw new Error(`Unsupported output format: ${this.containerFormat}`)
    }

    const outIO = new ffmpeg.IOContext(this.bufferSize, {
      onwrite: (chunk) => {
        this.chunks.push(b4a.from(chunk))
        return chunk.length
      }
    })

    this.outputFormatContext = new ffmpeg.OutputFormatContext(this.containerFormat, outIO)
  }

  #discoverAndConfigureStreams() {
    const videoBestStreamIndex = this.inputFormatContext.getBestStreamIndex(VIDEO)
    const audioBestStreamIndex = this.inputFormatContext.getBestStreamIndex(AUDIO)

    for (const inputStream of this.inputFormatContext.streams) {
      const codecType = inputStream.codecParameters.type

      if (codecType !== VIDEO && codecType !== AUDIO) {
        continue
      }

      const config = TranscodeStreamConfig.create(
        inputStream,
        this.outputFormatContext,
        this.containerFormat,
        this.outputParameters
      )

      if (!config) {
        if (
          inputStream.index !== videoBestStreamIndex &&
          inputStream.index !== audioBestStreamIndex
        ) {
          continue
        }
        throw new Error(`Input ${codecType === VIDEO ? 'video' : 'audio'} stream is not decodable`)
      }

      this.configs[inputStream.index] = config
    }
  }

  #configureOutput() {
    const options = formatRegistry.getMuxerOptions(this.containerFormat)
    const muxerOptions = ffmpeg.Dictionary.from(options)

    const duration = this.inputFormatContext.duration
    if (duration > 0) {
      this.outputFormatContext.duration = duration

      if (muxerOptions.get('live') === '1') {
        muxerOptions.set('live', '0')
      }
    }

    this.outputFormatContext.writeHeader(muxerOptions)
  }

  #trackTime(packet, config) {
    const ts = packet.dts
    const tb = config.inputStream.timeBase

    if (!Number.isFinite(ts) || ts < 0 || !tb.denominator) return

    const seconds = (ts * tb.numerator) / tb.denominator
    if (Number.isFinite(seconds) && seconds > this.currentTime) {
      this.currentTime = seconds
    }
  }

  #handleDecodedFrame(frame, config, packet) {
    if (config.isVideo()) {
      this.videoProcessor.process(frame, config, packet)
    } else if (config.isAudio()) {
      this.audioProcessor.process(frame, config, packet)
    }
  }

  *#drainChunks() {
    for (const chunk of this.chunks) {
      yield { buffer: chunk, time: this.currentTime }
    }
    this.chunks = []
  }

  *#processFrames() {
    const packet = new ffmpeg.Packet()
    const frame = new ffmpeg.Frame()

    try {
      while (this.inputFormatContext.readFrame(packet)) {
        const config = this.configs[packet.streamIndex]
        if (!config) {
          packet.unref()
          continue
        }

        this.#trackTime(packet, config)

        const { decoder } = config

        if (decoder.sendPacket(packet)) {
          while (decoder.receiveFrame(frame)) {
            this.#handleDecodedFrame(frame, config, packet)
          }
        }
        packet.unref()
        yield* this.#drainChunks()
      }
    } finally {
      packet.destroy()
      frame.destroy()
    }
  }

  *#finalize() {
    const packet = new ffmpeg.Packet()
    const frame = new ffmpeg.Frame()

    try {
      for (const index in this.configs) {
        const config = this.configs[index]

        this.#drainDecoder(config, packet, frame)
        this.audioProcessor.flush(config, packet)

        this._encodeAndWrite(config.encoder, null, config.outputStream, packet)
      }

      this.outputFormatContext.writeTrailer()
      yield* this.#drainChunks()
    } finally {
      packet.destroy()
      frame.destroy()
    }
  }

  #drainDecoder(config, packet, frame) {
    const { decoder } = config

    // An empty packet signals end of stream, releasing any frames the decoder
    // has buffered for reordering.
    packet.unref()
    if (!decoder.sendPacket(packet)) return

    while (decoder.receiveFrame(frame)) {
      this.#handleDecodedFrame(frame, config, packet)
    }
  }

  #cleanup() {
    for (const index in this.configs) {
      const config = this.configs[index]
      config.decoder.destroy()
      config.encoder.destroy()
      if (config.rescaler) config.rescaler.destroy()
      if (config.resampler) config.resampler.destroy()
      if (config.fifo) config.fifo.destroy()
      if (config.fifoFrame) config.fifoFrame.destroy()
      if (config.orientationGraph) config.orientationGraph.destroy()
      if (config.orientationFrame) config.orientationFrame.destroy()
    }

    if (this.inputFormatContext) this.inputFormatContext.destroy()
    if (this.outputFormatContext) this.outputFormatContext.destroy()
  }

  _encodeAndWrite(encoder, frame, outputStream, packet) {
    if (encoder.sendFrame(frame)) {
      while (encoder.receivePacket(packet)) {
        packet.streamIndex = outputStream.index
        packet.rescaleTimestamps(encoder.timeBase, outputStream.timeBase)
        this.outputFormatContext.writeFrame(packet)
        packet.unref()
      }
    }
  }
}

export { Transcoder, formatRegistry }
