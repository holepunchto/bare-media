import b4a from 'b4a'
import fs from 'bare-fs'
import fetch from 'bare-fetch'

import {
  importCodec,
  isCodecSupported,
  supportsQuality
} from '../shared/codecs.js'
import { detectMimeType, calculateFitDimensions } from './util'

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

  if (
    maxBytes &&
    preview.byteLength > maxBytes &&
    maybeResizedRGBA.frames?.length > 1
  ) {
    const quality = 75

    // drop every n frame

    for (const dropEvery of [4, 3, 2]) {
      const frames = maybeResizedRGBA.frames.filter(
        (frame, index) => index % dropEvery !== 0
      )
      const filtered = { ...maybeResizedRGBA, frames }
      preview = await encodeImageFromRGBA(filtered, format, { quality })
      if (!maxBytes || preview.byteLength <= maxBytes) {
        break
      }
    }

    // cap to 25 frames

    if (preview.byteLength > maxBytes) {
      const frames = maybeResizedRGBA.frames
        .slice(0, 50)
        .filter((frame, index) => index % 2 === 0)
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
    throw new Error(
      `Could not create preview under maxBytes, reached ${preview.byteLength} bytes`
    )
  }

  const encoded =
    encoding === 'base64'
      ? { inlined: b4a.toString(preview, 'base64') }
      : { buffer: preview }

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

async function getBuffer({ path, httpLink, buffer }) {
  if (buffer) return buffer

  if (path) {
    return fs.readFileSync(path)
  }

  if (httpLink) {
    const response = await fetch(httpLink)
    return await response.buffer()
  }

  throw new Error(
    'At least one of "path", "httpLink" or "buffer" must be provided'
  )
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
    const dimensions = calculateFitDimensions(
      width,
      height,
      maxWidth,
      maxHeight
    )
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
