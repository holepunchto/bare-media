import b4a from 'b4a'
import fs from 'bare-fs'
import fetch from 'bare-fetch'
import getMimeType from 'get-mime-type'

import { importCodec } from '../shared/codecs.js'
import { calculateFitDimensions } from './util'

const DEFAULT_PREVIEW_FORMAT = 'image/webp'

const animatableMimetypes = ['image/webp']

export async function createPreview({
  path,
  mimetype,
  maxWidth,
  maxHeight,
  format,
  encoding
}) {
  mimetype = mimetype || getMimeType(path)
  format = format || DEFAULT_PREVIEW_FORMAT

  const buffer = fs.readFileSync(path)
  const rgba = await decodeImageToRGBA(buffer, mimetype)
  const { width, height } = rgba

  const { dimensions, rgba: maybeResizedRGBA } = await resizeRGBA(
    rgba,
    width,
    height,
    maxWidth,
    maxHeight
  )

  const encoded = await encodeImageFromRGBA(maybeResizedRGBA, format, encoding)

  return {
    metadata: {
      dimensions: { width, height }
    },
    preview: {
      metadata: { mimetype: format, dimensions },
      ...encoded
    }
  }
}

export async function decodeImage({ path, httpLink, mimetype }) {
  let buffer

  if (path) {
    buffer = fs.readFileSync(path)
  } else if (httpLink) {
    const response = await fetch(httpLink)
    buffer = await response.buffer()
  }

  const rgba = await decodeImageToRGBA(buffer, mimetype)
  const { width, height, data } = rgba

  return {
    metadata: {
      dimensions: { width, height }
    },
    data
  }
}

async function decodeImageToRGBA(buffer, mimetype) {
  let rgba

  const codec = await importCodec(mimetype)

  if (animatableMimetypes.includes(mimetype)) {
    const { frames, width, height } = codec.decodeAnimated(buffer)
    const { data } = frames.next().value
    rgba = { width, height, data }
  } else {
    rgba = codec.decode(buffer)
  }

  return rgba
}

async function encodeImageFromRGBA(rgba, format, encoding) {
  const codec = await importCodec(format)
  const encoded = codec.encode(rgba)

  return encoding === 'base64'
    ? { inlined: b4a.toString(encoded, 'base64') }
    : { buffer: encoded }
}

async function resizeRGBA(rgba, width, height, maxWidth, maxHeight) {
  let maybeResizedRGBA, dimensions

  if (maxWidth && maxHeight && (width > maxWidth || height > maxHeight)) {
    const { resize } = await import('bare-image-resample')
    dimensions = calculateFitDimensions(width, height, maxWidth, maxHeight)
    maybeResizedRGBA = resize(rgba, dimensions.width, dimensions.height)
  } else {
    dimensions = { width, height }
    maybeResizedRGBA = rgba
  }

  return { dimensions, rgba: maybeResizedRGBA }
}
