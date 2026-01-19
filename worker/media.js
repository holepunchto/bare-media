import b4a from 'b4a'
import {
  IOContext,
  InputFormatContext,
  OutputFormatContext,
  Packet,
  Frame,
  Scaler,
  Image,
  Rational,
  Dictionary,
  Resampler,
  AudioFIFO,
  constants
} from 'bare-ffmpeg'

import {
  importCodec,
  isImageSupported,
  supportsQuality,
  isVideoSupported
} from '../shared/codecs.js'
import { getBuffer, detectMimeType, calculateFitDimensions } from './util'

const DEFAULT_PREVIEW_FORMAT = 'image/webp'
const DEFAULT_FRAME_COUNT = 10

const animatableMimetypes = ['image/webp']

export async function createImagePreview({
  path,
  httpLink,
  buffer,
  mimetype,
  maxWidth,
  maxHeight,
  maxFrames,
  maxBytes,
  format,
  encoding
}) {
  format = format || DEFAULT_PREVIEW_FORMAT

  const buff = await getBuffer({ path, httpLink, buffer })
  mimetype = mimetype || detectMimeType(buff, path)

  if (!isImageSupported(mimetype)) {
    throw new Error(`Unsupported file type: No codec available for ${mimetype}`)
  }

  const rgba = await decodeImageToRGBA(buff, mimetype, maxFrames)
  const { width, height } = rgba

  const maybeResizedRGBA = await resizeRGBA(rgba, maxWidth, maxHeight)

  const encoded = await encodeToMaxBytes(maybeResizedRGBA, format, maxBytes, encoding)

  return {
    metadata: {
      dimensions: { width, height }
    },
    preview: {
      metadata: {
        mimetype: format,
        dimensions: {
          width: maybeResizedRGBA.width,
          height: maybeResizedRGBA.height
        }
      },
      ...encoded
    }
  }
}

/** @deprecated Use createImagePreview instead */
export const createPreview = createImagePreview

export async function decodeImage({ path, httpLink, buffer, mimetype }) {
  const buff = await getBuffer({ path, httpLink, buffer })
  mimetype = mimetype || detectMimeType(buff, path)

  if (!isImageSupported(mimetype)) {
    throw new Error(`Unsupported file type: No codec available for ${mimetype}`)
  }

  const rgba = await decodeImageToRGBA(buff, mimetype)
  const { width, height, data } = rgba

  return {
    metadata: {
      dimensions: { width, height }
    },
    data
  }
}

export async function cropImage({
  path,
  httpLink,
  buffer,
  mimetype,
  left,
  top,
  width,
  height,
  format
}) {
  const buff = await getBuffer({ path, httpLink, buffer })
  mimetype = mimetype || detectMimeType(buff, path)

  if (!isImageSupported(mimetype)) {
    throw new Error(`Unsupported file type: No codec available for ${mimetype}`)
  }

  const rgba = await decodeImageToRGBA(buff, mimetype)

  const cropped = await cropRGBA(rgba, left, top, width, height)

  const data = await encodeImageFromRGBA(cropped, format || mimetype)

  return {
    metadata: {
      dimensions: {
        width: rgba.width,
        height: rgba.height
      }
    },
    data
  }
}

export async function transcode(stream) {
  const { path, httpLink, buffer, outputParameters, bufferSize = 32 * 1024 } = stream.data

  const buff = await getBuffer({ path, httpLink, buffer })
  const inIO = new IOContext(buff)
  const inputFormatContext = new InputFormatContext(inIO)
  const outIO = new IOContext(bufferSize, {
    onwrite: (chunk) => {
      stream.write({ buffer: chunk })
      return chunk.length
    }
  })

  const outputFormatName = outputParameters?.format || 'mp4'
  const outputFormat = new OutputFormatContext(outputFormatName, outIO)

  const streamMapping = []
  for (const inputStream of inputFormatContext.streams) {
    const codecType = inputStream.codecParameters.type

    if (codecType !== constants.mediaTypes.VIDEO && codecType !== constants.mediaTypes.AUDIO) {
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

    if (codecType === constants.mediaTypes.VIDEO) {
      outputStream.codecParameters.type = constants.mediaTypes.VIDEO

      // Select video codec based on output format
      if (outputFormatName === 'webm') {
        outputStream.codecParameters.id = constants.codecs.VP8
        outputStream.codecParameters.format = constants.pixelFormats.YUV420P
      } else {
        // Default to H264 for mp4, matroska, etc.
        outputStream.codecParameters.id = constants.codecs.H264
        outputStream.codecParameters.format = constants.pixelFormats.YUV420P
      }

      const width = outputParameters?.width || decoderContext.width
      const height = outputParameters?.height || decoderContext.height
      outputStream.codecParameters.width = width
      outputStream.codecParameters.height = height

      outputStream.timeBase = new Rational(1, 90000) // Use 90kHz timebase for video
    } else if (codecType === constants.mediaTypes.AUDIO) {
      outputStream.codecParameters.type = constants.mediaTypes.AUDIO

      let targetSampleRate = decoderContext.sampleRate

      // Select audio codec based on output format
      if (outputFormatName === 'webm') {
        outputStream.codecParameters.id = constants.codecs.OPUS
        outputStream.codecParameters.format = constants.sampleFormats.FLTP
        // Opus only supports specific sample rates: 48000, 24000, 16000, 12000, 8000
        // Use 48000 Hz as default for best quality
        targetSampleRate = 48000
      } else {
        // Default to AAC for mp4, matroska, etc.
        outputStream.codecParameters.id = constants.codecs.AAC
        outputStream.codecParameters.format = constants.sampleFormats.FLTP
      }

      outputStream.codecParameters.sampleRate = targetSampleRate
      outputStream.codecParameters.channelLayout = decoderContext.channelLayout
      outputStream.timeBase = new Rational(1, targetSampleRate)
    }

    const encoder = outputStream.encoder()

    if (codecType === constants.mediaTypes.VIDEO) {
      encoder.timeBase = outputStream.timeBase
      encoder.width = outputStream.codecParameters.width
      encoder.height = outputStream.codecParameters.height
      encoder.pixelFormat = outputStream.codecParameters.format

      if (decoderContext.frameRate && decoderContext.frameRate.valid) {
        encoder.frameRate = decoderContext.frameRate
      } else {
        encoder.frameRate = new Rational(30, 1)
      }
      encoder.gopSize = 30
    } else if (codecType === constants.mediaTypes.AUDIO) {
      encoder.timeBase = outputStream.timeBase
      encoder.sampleRate = outputStream.codecParameters.sampleRate
      encoder.channelLayout = outputStream.codecParameters.channelLayout
      encoder.sampleFormat = outputStream.codecParameters.format
    }

    if (outputFormat.outputFormat.flags & constants.formatFlags.GLOBALHEADER) {
      encoder.flags |= constants.codecFlags.GLOBAL_HEADER
    }

    // Set encoder options to allow software fallback for hardware encoders
    const encoderOptions = new Dictionary()
    if (codecType === constants.mediaTypes.VIDEO) {
      encoderOptions.set('allow_sw', '1') // Allow software fallback if hardware encoder fails
    }

    try {
      encoder.open(encoderOptions)
    } catch (err) {
      // If encoder fails to open (e.g., hardware encoder not available in CI), skip this stream
      console.warn(`Failed to open encoder for stream ${inputStream.index}: ${err.message}`)
      encoder.destroy()
      continue
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
      totalSamplesOutput: 0, // For audio PTS calculation
      nextVideoPts: 0 // For video PTS calculation
    }
  }
  const muxerOptions = new Dictionary()

  switch (outputFormatName) {
    case 'mp4':
      // Fragmented MP4 for streaming: allows playback before file is complete
      muxerOptions.set('movflags', 'frag_keyframe+empty_moov+default_base_moof')
      break
    case 'webm':
      // Live streaming mode for WebM
      muxerOptions.set('live', '1')
      break
    case 'matroska':
    case 'mkv':
      // Live streaming mode for Matroska
      muxerOptions.set('live', '1')
      break
    // Other formats (flv, mpegts, etc.) work without special flags
  }

  outputFormat.writeHeader(muxerOptions)

  const packet = new Packet()
  const frame = new Frame()

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
          if (mapping.inputStream.codecParameters.type === constants.mediaTypes.VIDEO) {
            if (
              !mapping.rescaler ||
              mapping.lastWidth !== frame.width ||
              mapping.lastHeight !== frame.height ||
              mapping.lastFormat !== frame.format
            ) {
              if (mapping.rescaler) mapping.rescaler.destroy()

              mapping.rescaler = new Scaler(
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

            const outFrame = new Frame()
            outFrame.format = encoder.pixelFormat
            outFrame.width = encoder.width
            outFrame.height = encoder.height
            outFrame.alloc()
            outFrame.copyProperties(frame)

            mapping.rescaler.scale(frame, outFrame)

            // Force CFR (Constant Frame Rate) to avoid timestamp issues
            outFrame.pts = mapping.nextVideoPts

            const frameDuration =
              (encoder.timeBase.denominator * encoder.frameRate.denominator) /
              (encoder.timeBase.numerator * encoder.frameRate.numerator)

            mapping.nextVideoPts += frameDuration

            encodeAndWrite(encoder, outFrame, outputStream, outputFormat, packet)

            outFrame.destroy()
          } else if (mapping.inputStream.codecParameters.type === constants.mediaTypes.AUDIO) {
            if (!mapping.resampler) {
              mapping.resampler = new Resampler(
                frame.sampleRate,
                frame.channelLayout,
                frame.format,
                encoder.sampleRate,
                encoder.channelLayout,
                encoder.sampleFormat
              )
            }

            if (!mapping.fifo) {
              mapping.fifo = new AudioFIFO(
                encoder.sampleFormat,
                encoder.channelLayout.nbChannels,
                encoder.frameSize
              )
              mapping.fifoFrame = new Frame()
              mapping.fifoFrame.format = encoder.sampleFormat
              mapping.fifoFrame.channelLayout = encoder.channelLayout
              mapping.fifoFrame.sampleRate = encoder.sampleRate
            }

            const outFrame = new Frame()
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

    // Note: inputFormatContext has the ownership of inIO so it will be destroy
    // along it.
    inputFormatContext.destroy()
    outputFormat.destroy()
  }

  stream.end()
}

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

async function decodeImageToRGBA(buffer, mimetype, maxFrames) {
  let rgba

  const codec = await importCodec(mimetype)

  if (animatableMimetypes.includes(mimetype)) {
    const { width, height, loops, frames } = codec.decodeAnimated(buffer)
    const data = []
    for (const frame of frames) {
      if (maxFrames > 0 && data.length >= maxFrames) break
      data.push(frame)
    }
    rgba = { width, height, loops, frames: data }
  } else {
    rgba = codec.decode(buffer)
  }

  return rgba
}

async function encodeImageFromRGBA(rgba, format, opts) {
  const codec = await importCodec(format)

  let encoded
  if (Array.isArray(rgba.frames)) {
    encoded = codec.encodeAnimated(rgba, opts)
  } else {
    encoded = codec.encode(rgba, opts)
  }

  return encoded
}

async function resizeRGBA(rgba, maxWidth, maxHeight) {
  const { width, height } = rgba

  let maybeResizedRGBA

  if (maxWidth && maxHeight && (width > maxWidth || height > maxHeight)) {
    const { resize } = await import('bare-image-resample')
    const dimensions = calculateFitDimensions(width, height, maxWidth, maxHeight)
    if (Array.isArray(rgba.frames)) {
      const frames = []
      for (const frame of rgba.frames) {
        const resized = resize(frame, dimensions.width, dimensions.height)
        frames.push({ ...resized, timestamp: frame.timestamp })
      }
      maybeResizedRGBA = {
        width: frames[0].width,
        height: frames[0].height,
        loops: rgba.loops,
        frames
      }
    } else {
      maybeResizedRGBA = resize(rgba, dimensions.width, dimensions.height)
    }
  } else {
    maybeResizedRGBA = rgba
  }

  return maybeResizedRGBA
}

async function encodeToMaxBytes(rgba, format, maxBytes, encoding) {
  let preview = await encodeImageFromRGBA(rgba, format)

  if (maxBytes && preview.byteLength > maxBytes && supportsQuality(format)) {
    const MIN_QUALITY = 50
    for (let quality = 80; quality >= MIN_QUALITY; quality -= 15) {
      preview = await encodeImageFromRGBA(rgba, format, { quality })
      if (preview.byteLength <= maxBytes) {
        break
      }
    }
  }

  if (maxBytes && preview.byteLength > maxBytes && rgba.frames?.length > 1) {
    const quality = 75

    for (const dropEvery of [4, 3, 2]) {
      const frames = rgba.frames.filter((frame, index) => index % dropEvery !== 0)
      const filtered = { ...rgba, frames }
      preview = await encodeImageFromRGBA(filtered, format, { quality })
      if (preview.byteLength <= maxBytes) {
        break
      }
    }

    if (preview.byteLength > maxBytes) {
      const frames = rgba.frames.slice(0, 50).filter((frame, index) => index % 2 === 0)
      const capped = { ...rgba, frames }
      preview = await encodeImageFromRGBA(capped, format, { quality })
    }

    if (preview.byteLength > maxBytes) {
      const oneFrame = { ...rgba, frames: rgba.frames.slice(0, 1) }
      preview = await encodeImageFromRGBA(oneFrame, format)
    }
  }

  if (maxBytes && preview.byteLength > maxBytes) {
    throw new Error(`Could not create preview under maxBytes, reached ${preview.byteLength} bytes`)
  }

  return encoding === 'base64' ? { inlined: b4a.toString(preview, 'base64') } : { buffer: preview }
}

async function cropRGBA(rgba, left, top, width, height) {
  if (
    left < 0 ||
    top < 0 ||
    width <= 0 ||
    height <= 0 ||
    left + width > rgba.width ||
    top + height > rgba.height
  ) {
    throw new Error('Crop rectangle out of bounds')
  }

  const data = Buffer.alloc(width * height * 4)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIndex = ((y + top) * rgba.width + (x + left)) * 4
      const dstIndex = (y * width + x) * 4

      data[dstIndex] = rgba.data[srcIndex]
      data[dstIndex + 1] = rgba.data[srcIndex + 1]
      data[dstIndex + 2] = rgba.data[srcIndex + 2]
      data[dstIndex + 3] = rgba.data[srcIndex + 3]
    }
  }

  return { width, height, data }
}

export async function createVideoPreview({
  path,
  httpLink,
  buffer,
  mimetype,
  maxWidth,
  maxHeight,
  maxBytes,
  timestamp,
  percent,
  animated = false,
  frameCount = DEFAULT_FRAME_COUNT,
  format,
  encoding
}) {
  format = format || DEFAULT_PREVIEW_FORMAT

  const buff = await getBuffer({ path, httpLink, buffer })
  mimetype = mimetype || detectMimeType(buff, path)

  if (!isVideoSupported(mimetype)) {
    throw new Error(`Unsupported video type: ${mimetype}`)
  }

  const { rgba, duration } = extractVideoFrames(buff, animated ? frameCount : 1, timestamp, percent)

  const maybeResizedRGBA = await resizeRGBA(rgba, maxWidth, maxHeight)

  const encoded = await encodeToMaxBytes(maybeResizedRGBA, format, maxBytes, encoding)

  return {
    metadata: {
      dimensions: { width: rgba.width, height: rgba.height },
      duration
    },
    preview: {
      metadata: {
        mimetype: format,
        dimensions: {
          width: maybeResizedRGBA.width,
          height: maybeResizedRGBA.height
        }
      },
      ...encoded
    }
  }
}

function extractVideoFrames(buffer, frameCount, timestamp, percent) {
  const io = new IOContext(buffer)
  const formatCtx = new InputFormatContext(io)

  const videoStream = formatCtx.getBestStream(constants.mediaTypes.VIDEO)
  if (!videoStream) {
    formatCtx.destroy()
    throw new Error('No video stream found')
  }

  const { width, height, format: pixelFormat } = videoStream.codecParameters
  const streamDuration = videoStream.duration
  const timeBase = videoStream.timeBase

  // Calculate duration in ms
  const duration = Math.floor((streamDuration * timeBase.numerator * 1000) / timeBase.denominator)

  const decoder = videoStream.decoder()
  decoder.open()

  const scaler = new Scaler(pixelFormat, width, height, constants.pixelFormats.RGBA, width, height)

  const packet = new Packet()
  const frame = new Frame()
  const rgbaFrame = new Frame()
  rgbaFrame.format = constants.pixelFormats.RGBA
  rgbaFrame.width = width
  rgbaFrame.height = height
  rgbaFrame.alloc()

  const frames = []
  let targetTimestamp = 0

  if (timestamp !== undefined) {
    targetTimestamp = timestamp
  } else if (percent !== undefined) {
    targetTimestamp = Math.floor((percent / 100) * duration)
  }

  // Convert target timestamp from ms to stream time base units
  const targetPts = Math.floor(
    (targetTimestamp * timeBase.denominator) / (timeBase.numerator * 1000)
  )

  // Calculate frame interval for animated mode
  const frameInterval = frameCount > 1 ? Math.floor(streamDuration / frameCount) : 0
  let nextTargetPts = frameCount > 1 ? 0 : targetPts
  let frameIndex = 0

  while (formatCtx.readFrame(packet)) {
    if (packet.streamIndex !== videoStream.index) {
      packet.unref()
      continue
    }

    decoder.sendPacket(packet)

    while (decoder.receiveFrame(frame)) {
      const framePts = frame.pts

      // For animated: collect frames at intervals
      // For single frame: find frame at or after target timestamp
      const shouldCapture =
        frameCount > 1 ? framePts >= nextTargetPts : framePts >= targetPts && frames.length === 0

      if (shouldCapture) {
        scaler.scale(frame, rgbaFrame)

        const image = new Image(constants.pixelFormats.RGBA, width, height)
        image.read(rgbaFrame)

        frames.push({
          width,
          height,
          data: Buffer.from(image.data)
        })

        if (frameCount > 1) {
          frameIndex++
          nextTargetPts = frameIndex * frameInterval
        }

        if (frames.length >= frameCount) {
          break
        }
      }

      frame.unref()
    }

    packet.unref()

    if (frames.length >= frameCount) {
      break
    }
  }

  // If we didn't capture any frames (e.g., target was beyond video), take the last available
  if (frames.length === 0) {
    // Reset and capture first frame
    formatCtx.destroy()
    return extractVideoFrames(buffer, frameCount, 0, undefined)
  }

  packet.destroy()
  frame.destroy()
  rgbaFrame.destroy()
  scaler.destroy()
  decoder.destroy()
  formatCtx.destroy()

  let rgba
  if (frameCount > 1 && frames.length > 1) {
    const frameInterval = Math.floor(duration / frames.length)
    rgba = {
      width: frames[0].width,
      height: frames[0].height,
      loops: 0,
      frames: frames.map((f, index) => ({
        ...f,
        timestamp: index * frameInterval
      }))
    }
  } else {
    rgba = frames[0]
  }

  return { rgba, duration }
}
