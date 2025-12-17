import b4a from 'b4a'
import ffmpeg from 'bare-ffmpeg'

import { importCodec, isCodecSupported, supportsQuality } from '../shared/codecs.js'
import { getBuffer, detectMimeType, calculateFitDimensions } from './util'

const DEFAULT_PREVIEW_FORMAT = 'image/webp'

const animatableMimetypes = ['image/webp']

export async function createPreview({
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

  if (!isCodecSupported(mimetype)) {
    throw new Error(`Unsupported file type: No codec available for ${mimetype}`)
  }

  const rgba = await decodeImageToRGBA(buff, mimetype, maxFrames)
  const { width, height } = rgba

  const maybeResizedRGBA = await resizeRGBA(rgba, maxWidth, maxHeight)

  let preview = await encodeImageFromRGBA(maybeResizedRGBA, format)

  // quality reduction

  if (maxBytes && preview.byteLength > maxBytes && supportsQuality(format)) {
    const MIN_QUALITY = 50
    for (let quality = 80; quality >= MIN_QUALITY; quality -= 15) {
      preview = await encodeImageFromRGBA(maybeResizedRGBA, format, { quality })
      if (preview.byteLength <= maxBytes) {
        break
      }
    }
  }

  // fps reduction

  if (maxBytes && preview.byteLength > maxBytes && maybeResizedRGBA.frames?.length > 1) {
    const quality = 75

    // drop every n frame

    for (const dropEvery of [4, 3, 2]) {
      const frames = maybeResizedRGBA.frames.filter((frame, index) => index % dropEvery !== 0)
      const filtered = { ...maybeResizedRGBA, frames }
      preview = await encodeImageFromRGBA(filtered, format, { quality })
      if (!maxBytes || preview.byteLength <= maxBytes) {
        break
      }
    }

    // cap to 25 frames

    if (preview.byteLength > maxBytes) {
      const frames = maybeResizedRGBA.frames.slice(0, 50).filter((frame, index) => index % 2 === 0)
      const capped = { ...maybeResizedRGBA, frames }
      preview = await encodeImageFromRGBA(capped, format, { quality })
    }

    // take only one frame

    if (preview.byteLength > maxBytes) {
      const oneFrame = {
        ...maybeResizedRGBA,
        frames: maybeResizedRGBA.frames.slice(0, 1)
      }
      preview = await encodeImageFromRGBA(oneFrame, format)
    }
  }

  if (maxBytes && preview.byteLength > maxBytes) {
    throw new Error(`Could not create preview under maxBytes, reached ${preview.byteLength} bytes`)
  }

  const encoded =
    encoding === 'base64' ? { inlined: b4a.toString(preview, 'base64') } : { buffer: preview }

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

export async function decodeImage({ path, httpLink, buffer, mimetype }) {
  const buff = await getBuffer({ path, httpLink, buffer })
  mimetype = mimetype || detectMimeType(buff, path)

  if (!isCodecSupported(mimetype)) {
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

  if (!isCodecSupported(mimetype)) {
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
  const { path, httpLink, buffer, outputParameters } = stream.data

  const buff = await getBuffer({ path, httpLink, buffer })
  const inIO = new ffmpeg.IOContext(buff)
  const inputFormatContext = new ffmpeg.InputFormatContext(inIO)
  const outIO = new ffmpeg.IOContext(4096, {
    onwrite: (chunk) => {
      stream.write({ buffer: chunk })
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
      outputStream.codecParameters.id = ffmpeg.Codec.H264.id
      outputStream.codecParameters.type = ffmpeg.constants.mediaTypes.VIDEO

      const width = outputParameters?.width || decoderContext.width
      const height = outputParameters?.height || decoderContext.height
      outputStream.codecParameters.width = width
      outputStream.codecParameters.height = height

      // H264 commonly uses YUV420P
      outputStream.codecParameters.format = ffmpeg.constants.pixelFormats.YUV420P
      outputStream.timeBase = new ffmpeg.Rational(1, 90000) // Use 90kHz timebase for video in MP4
    } else if (codecType === ffmpeg.constants.mediaTypes.AUDIO) {
      outputStream.codecParameters.id = ffmpeg.Codec.AAC.id
      outputStream.codecParameters.type = ffmpeg.constants.mediaTypes.AUDIO
      outputStream.codecParameters.sampleRate = decoderContext.sampleRate
      outputStream.codecParameters.channelLayout = decoderContext.channelLayout
      outputStream.codecParameters.format = ffmpeg.constants.sampleFormats.FLTP // AAC uses FLTP
      outputStream.timeBase = new ffmpeg.Rational(1, decoderContext.sampleRate)
    }

    const encoder = outputStream.encoder()

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

    encoder.open()

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
  const muxerOptions = new ffmpeg.Dictionary()
  if (outputFormatName === 'mp4') {
    muxerOptions.set('movflags', 'frag_keyframe+empty_moov+default_base_moof')
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

            // Force CFR (Constant Frame Rate) to avoid timestamp issues
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
