import b4a from 'b4a'
import fs from 'bare-fs'

import { importCodec } from '../shared/codecs.js'

const DEFAULT_PREVIEW_FORMAT = 'image/webp'

export async function createPreview ({ path, mimetype, size, format, encoding }) {
  format = format || DEFAULT_PREVIEW_FORMAT

  const codec = await importCodec(mimetype)
  const buffer = fs.readFileSync(path)
  const rgba = codec.decode(buffer)
  const { width, height } = rgba

  return {
    metadata: {
      dimensions: { width, height }
    },
    preview: await createPreviewFromRGBA(rgba, size, format, encoding)
  }
}

export async function createPreviewAll ({ path, mimetype, size, format }) {
  format = format || DEFAULT_PREVIEW_FORMAT

  const codec = await importCodec(mimetype)
  const buffer = fs.readFileSync(path)
  const rgba = codec.decode(buffer)
  const { width, height } = rgba

  const [small, medium, large] = await Promise.all([
    createPreviewFromRGBA(rgba, size.small, format, 'base64'),
    createPreviewFromRGBA(rgba, size.medium, format, 'base64'),
    createPreviewFromRGBA(rgba, size.large, format)
  ])

  return {
    metadata: {
      dimensions: { width, height }
    },
    preview: { small, medium, large }
  }
}

async function createPreviewFromRGBA (rgba, size, format, encoding) {
  format = format || DEFAULT_PREVIEW_FORMAT
  size = size || null

  const { width, height } = rgba
  let maybeResized, dimensions

  if (size !== null) {
    const { resize } = await import('bare-image-resample')
    dimensions = calcResizedDimensions(width, height, size)
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

function calcResizedDimensions (width, height, max) {
  const dimensions = {}

  if (width > max || height > max) {
    if (width > height) {
      dimensions.width = max
      dimensions.height = Math.ceil((max / width) * height)
    } else {
      dimensions.width = Math.ceil((max / height) * width)
      dimensions.height = max
    }
  } else {
    dimensions.width = width
    dimensions.height = height
  }

  return dimensions
}
