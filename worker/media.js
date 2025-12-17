import b4a from 'b4a'
import exif from 'bare-exif'

import {
  importCodec,
  isCodecSupported,
  supportsQuality
} from '../shared/codecs.js'
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

  const rgba = await decodeImageToRGBA(buff, { mimetype, maxFrames })
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

  const rgba = await decodeImageToRGBA(buff, { mimetype })
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

  const rgba = await decodeImageToRGBA(buff, { mimetype })

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

async function decodeImageToRGBA(buffer, opts = {}) {
  const { mimetype, maxFrames, applyOrientation = true } = opts

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

    if (applyOrientation) {
      const exifData = new exif.Data(buffer)
      const orientation = exifData.entry(exif.constants.tags.ORIENTATION)
      if (orientation) {
        rgba = rotateRGBA(rgba, orientation.read())
      }
    }
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

const EXIF_ORIENTATION = {
  NORMAL: 1,
  MIRROR_HORIZONTAL: 2,
  ROTATE_180: 3,
  MIRROR_VERTICAL: 4,
  TRANSPOSE: 5,
  ROTATE_90: 6,
  TRANSVERSE: 7,
  ROTATE_270: 8
}

function rotateRGBA(rgba, exifOrientation) {
  if (exifOrientation <= 1 || exifOrientation > 8) return rgba

  const { width: srcW, height: srcH, data } = rgba

  let dstW = srcW
  let dstH = srcH

  if (exifOrientation >= 5 && exifOrientation <= 8) {
    dstW = srcH
    dstH = srcW
  }

  const dstData = Buffer.alloc(dstW * dstH * 4)

  const setPixel = (sx, sy, dx, dy) => {
    const srcIdx = (sy * srcW + sx) * 4
    const dstIdx = (dy * dstW + dx) * 4
    dstData[dstIdx] = data[srcIdx]
    dstData[dstIdx + 1] = data[srcIdx + 1]
    dstData[dstIdx + 2] = data[srcIdx + 2]
    dstData[dstIdx + 3] = data[srcIdx + 3]
  }

  for (let sy = 0; sy < srcH; sy++) {
    for (let sx = 0; sx < srcW; sx++) {
      let dx
      let dy

      switch (exifOrientation) {
        case EXIF_ORIENTATION.MIRROR_HORIZONTAL:
          dx = srcW - 1 - sx
          dy = sy
          break
        case EXIF_ORIENTATION.ROTATE_180:
          dx = srcW - 1 - sx
          dy = srcH - 1 - sy
          break
        case EXIF_ORIENTATION.MIRROR_VERTICAL:
          dx = sx
          dy = srcH - 1 - sy
          break
        case EXIF_ORIENTATION.TRANSPOSE:
          dx = sy
          dy = sx
          break
        case EXIF_ORIENTATION.ROTATE_90:
          dx = srcH - 1 - sy
          dy = sx
          break
        case EXIF_ORIENTATION.TRANSVERSE:
          dx = srcH - 1 - sy
          dy = srcW - 1 - sx
          break
        case EXIF_ORIENTATION.ROTATE_270:
          dx = sy
          dy = srcW - 1 - sx
          break
        default:
          dx = sx
          dy = sy
      }

      setPixel(sx, sy, dx, dy)
    }
  }

  return {
    width: dstW,
    height: dstH,
    data: dstData
  }
}
