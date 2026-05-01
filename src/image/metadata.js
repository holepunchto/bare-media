import { IMAGE } from '../../types.js'
import { detectMimeType, isHttpUrl } from '../util.js'

const supportedExifMimetypes = new Set([IMAGE.JPEG, IMAGE.JPG, IMAGE.TIFF, IMAGE.TIF])

function isExifSupported(buffer) {
  return supportedExifMimetypes.has(detectMimeType(buffer))
}

function isSupported(buffer) {
  return isExifSupported(buffer)
}

function resolveExifTag(exif, tag) {
  if (typeof tag === 'number') return tag
  
  if (typeof tag === 'string') {
    for (const [name, value] of Object.entries(exif.constants.tags)) {
      if (name.toLowerCase() === tag.toLowerCase()) {
        return value
      }
    }
  }

  return null
}

async function exifValue(buffer, tag) {
  try {
    const exif = await import('bare-exif')
    const exifData = new exif.Data(buffer)
    const entry = exifData.entry(resolveExifTag(exif, tag))
    return entry?.read()
  } catch {
    return null
  }
}

async function exifMetadata(buffer) {
  if (!isExifSupported(buffer)) return {}

  const data = {}

  try {
    const exif = await import('bare-exif')
    const exifData = new exif.Data(buffer)
    for (const [name, tag] of Object.entries(exif.constants.tags)) {
      const entry = exifData.entry(tag)
      if (!entry) continue
      data[name] = entry.read()
    }
  } finally {
    return data
  }
}

function metadataTag(buffer, tag) {
  if (!isExifSupported(buffer)) return null
  return exifValue(buffer, tag)
}

async function metadata(buffer, opts = {}) {
  if (!isSupported(buffer)) return {}

  if (opts.tag) {
    return metadataTag(buffer, opts.tag)
  }

  const data = {}

  data.exif = await exifMetadata(buffer)

  if (data.exif.ORIENTATION) {
    data.orientation = data.exif.ORIENTATION
  }

  return data
}

export { metadata }
