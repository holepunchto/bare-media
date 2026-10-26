import { IMAGE } from '../../types.js'
import { detectMimeType } from '../codecs.js'
import { readHeifMetadata, stripHEIFMetadata } from './metadata/heif'
import { exifValue, exifMetadata } from './metadata/exif'
import { stripJPEGMetadata } from './metadata/jpeg'

const EXIF_MIMETYPES = new Set([IMAGE.JPEG, IMAGE.JPG, IMAGE.TIFF, IMAGE.TIF])
const HEIF_MIMETYPES = new Set([IMAGE.HEIC, IMAGE.HEIF, IMAGE.AVIF])

async function metadata(buffer, opts = {}) {
  const mimetype = detectMimeType(buffer)
  const isHeif = HEIF_MIMETYPES.has(mimetype)
  const isExif = EXIF_MIMETYPES.has(mimetype)

  if (!isHeif && !isExif) return {}

  const { exifRaw, ...extra } = isHeif
    ? await readHeifMetadata(buffer, { exifOnly: !!opts.tag })
    : { exifRaw: buffer }

  if (opts.tag) {
    return exifRaw ? exifValue(exifRaw, opts.tag) : null
  }

  const exif = exifRaw ? await exifMetadata(exifRaw) : {}
  const data = { exif, ...extra }

  if (exif.ORIENTATION) {
    data.orientation = exif.ORIENTATION
  }

  return data
}

async function strip(buffer, opts = {}) {
  const mimetype = detectMimeType(buffer)

  if (mimetype === IMAGE.JPEG || mimetype === IMAGE.JPG) {
    return stripJPEGMetadata(buffer, opts)
  }

  if (HEIF_MIMETYPES.has(mimetype)) {
    return await stripHEIFMetadata(buffer, opts)
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
