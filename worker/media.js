import b4a from 'b4a'
import fs from 'bare-fs'
import getMimeType from 'get-mime-type'

import { importCodec } from '../shared/codecs.js'

export async function createPreview ({ path, size, mimetype = 'image/webp', encoding = '' }) {
  const codec = await importCodec(getMimeType(path))
  const buffer = fs.readFileSync(path)
  const rgba = codec.decode(buffer)
  const { width, height } = rgba

  return {
    metadata: {
      dimensions: { width, height }
    },
    preview: await createPreviewFromRGBA(rgba, size, mimetype, encoding)
  }
}

export async function createPreviewAll ({ path, size, mimetype = 'image/webp' }) {
  const codec = await importCodec(getMimeType(path))
  const buffer = fs.readFileSync(path)
  const rgba = codec.decode(buffer)
  const { width, height } = rgba

  const [small, medium, large] = await Promise.all([
    createPreviewFromRGBA(rgba, size.small, mimetype, 'base64'),
    createPreviewFromRGBA(rgba, size.medium, mimetype, 'base64'),
    createPreviewFromRGBA(rgba, size.large, mimetype)
  ])

  return {
    metadata: {
      dimensions: { width, height }
    },
    preview: { small, medium, large }
  }
}

async function createPreviewFromRGBA (rgba, size, mimetype = 'image/webp', encoding = '') {
  const { resize } = await import('bare-image-resample')
  const dimensions = calcResizedDimensions(rgba.width, rgba.height, size)
  const resized = resize(rgba, dimensions.width, dimensions.height)
  const codec = await importCodec(mimetype)
  const encoded = codec.encode(resized)

  const result = encoding === 'base64'
    ? { inlined: b4a.toString(encoded, 'base64') }
    : { buffer: encoded }

  return {
    ...result,
    metadata: { mimetype, dimensions }
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
