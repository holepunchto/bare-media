import b4a from 'b4a'
import fs from 'bare-fs'
import getMimeType from 'get-mime-type'

import { importCodec } from '../shared/codecs.js'

export async function createPreview ({ path, maxSize, mimetype = 'image/webp' }) {
  const decoder = await importCodec(getMimeType(path))
  const buffer = fs.readFileSync(path)
  const decoded = decoder.decode(buffer)
  const { width, height } = decoded

  const dimensions = {
    small: calcResizedDimensions(width, height, maxSize.small),
    medium: calcResizedDimensions(width, height, maxSize.medium),
    large: calcResizedDimensions(width, height, maxSize.large)
  }

  const { resize } = await import('bare-image-resample')
  const small = resize(decoded, dimensions.small.width, dimensions.small.height)
  const medium = resize(decoded, dimensions.medium.width, dimensions.medium.height)
  const large = resize(decoded, dimensions.large.width, dimensions.large.height)

  const encoder = await importCodec(mimetype)
  const encoded = {
    small: encoder.encode(small),
    medium: encoder.encode(medium),
    large: encoder.encode(large)
  }

  return {
    metadata: {
      dimensions: { width, height }
    },
    preview: {
      small: {
        inlined: b4a.toString(encoded.small, 'base64'),
        metadata: { mimetype, dimensions: dimensions.small }
      },
      medium: {
        inlined: b4a.toString(encoded.medium, 'base64'),
        metadata: { mimetype, dimensions: dimensions.medium }
      },
      large: {
        buffer: encoded.large,
        metadata: { mimetype, dimensions: dimensions.large }
      }
    }
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
