import { IMAGE } from '../../types.js'
import { detectMimeType, isHttpUrl } from '../util.js'

const supportedExifMimetypes = new Set([IMAGE.JPEG, IMAGE.JPG, IMAGE.TIFF, IMAGE.TIF])

function isExifSupported(buffer) {
  return supportedExifMimetypes.has(detectMimeType(buffer))
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
  if (!isExifSupported(buffer)) return {}

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

async function stripJPEG(buffer, opts = {}) {
  const { keepColor = true, keepOrientation = false } = opts

  const jpeg = await import('bare-jpeg')
  const APP1 = 0xe1
  const APP14 = 0xee

  const { markers } = jpeg.readHeader(buffer)

  let newMarkers = []

  if (keepColor) {
    newMarkers = markers.filter((m) => m.marker === APP14)
  }

  if (keepOrientation) {
    const exif = await import('bare-exif')
    const tags = exif.constants.tags
    const data = new exif.Data(buffer)

    for (const tag of Object.values(tags)) {
      if (tag !== tags.ORIENTATION) {
        data.removeEntry(tag)
      }
    }

    const rawExif = data.saveData()

    newMarkers.push({
      marker: APP1,
      data: rawExif
    })
  }

  return jpeg.replaceMarkers(buffer, newMarkers)
}

async function strip(buffer, opts = {}) {
  const mimetype = detectMimeType(buffer)

  if (mimetype === IMAGE.JPEG || mimetype === IMAGE.JPG) {
    return stripJPEG(buffer, opts)
  }

  throw new Error(`metadata strip(): unsupported type ${mimetype}`)
}

class ImageMetadataPipeline {
  constructor(input, opts = {}) {
    this.input = input
    this.steps = []
    this.read = opts.read
    this.write = opts.save

    // Add future chainable metadata edit methods here, like set() or remove().
    const methods = ['strip']
    for (let method of methods) {
      this[method] = (opts) => {
        this.steps.push({ op: method, opts })
        return this
      }
    }
  }

  async then(resolve, reject) {
    try {
      let buffer = await this.read(this.input)

      for (const step of this.steps) {
        if (step.op === 'strip') {
          buffer = await strip(buffer, step.opts)
        }
      }

      resolve(buffer)
    } catch (err) {
      reject(err)
    }
  }

  async save(filename, opts) {
    const buffer = await this
    return this.write(filename, buffer, opts)
  }
}

metadata.strip = strip

export { metadata, ImageMetadataPipeline }
