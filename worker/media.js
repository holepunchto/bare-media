import b4a from 'b4a'
import fs from 'bare-fs'

import { importCodec } from '../shared/codecs.js'
import { calculateFitDimensions } from './util'

const DEFAULT_PREVIEW_FORMAT = 'image/webp'

export async function createPreview ({ path, mimetype, maxWidth, maxHeight, format, encoding }) {
  format = format || DEFAULT_PREVIEW_FORMAT

  const codec = await importCodec(mimetype)
  const buffer = fs.readFileSync(path)
  const rgba = codec.decode(buffer)
  const { width, height } = rgba

  return {
    metadata: {
      dimensions: { width, height }
    },
    preview: await createPreviewFromRGBA(rgba, maxWidth, maxHeight, format, encoding)
  }
}

export async function createPreviewAll ({ path, mimetype, maxWidth, maxHeight, format }) {
  format = format || DEFAULT_PREVIEW_FORMAT

  const codec = await importCodec(mimetype)
  const buffer = fs.readFileSync(path)
  const rgba = codec.decode(buffer)
  const { width, height } = rgba

  const [small, medium, large] = await Promise.all([
    createPreviewFromRGBA(rgba, maxWidth.small, maxHeight.small, format, 'base64'),
    createPreviewFromRGBA(rgba, maxWidth.medium, maxHeight.medium, format, 'base64'),
    createPreviewFromRGBA(rgba, maxWidth.large, maxHeight.large, format)
  ])

  return {
    metadata: {
      dimensions: { width, height }
    },
    preview: { small, medium, large }
  }
}

async function createPreviewFromRGBA (rgba, maxWidth, maxHeight, format, encoding) {
  format = format || DEFAULT_PREVIEW_FORMAT

  const { width, height } = rgba
  let maybeResized, dimensions

  if (maxWidth && maxHeight && width > maxWidth && height > maxHeight) {
    const { resize } = await import('bare-image-resample')
    dimensions = calculateFitDimensions(width, height, maxWidth, maxHeight)
    maybeResized = resize(rgba, dimensions.width, dimensions.height)
  } else {
    dimensions = { width, height }
    maybeResized = rgba
  }

  const codec = await importCodec(format)
  const encoded = codec.encode(maybeResized)

  const result = encoding === 'base64'
    ? { inlined: b4a.toString(encoded, 'base64') }
    : { buffer: encoded }

  return {
    ...result,
    metadata: { mimetype: format, dimensions }
  }
}
