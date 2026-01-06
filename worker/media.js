import b4a from 'b4a'
import { IOContext, InputFormatContext, Packet, Frame, Scaler, Image, constants } from 'bare-ffmpeg'

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
