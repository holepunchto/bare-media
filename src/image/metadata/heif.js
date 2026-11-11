import { EXIF_HEADER, stripExif } from './exif'

const HEIF_METADATA_TYPE = {
  EXIF: 'Exif',
  MIME: 'mime',
  URI: 'uri '
}
const XMP_CONTENT_TYPE = 'application/rdf+xml'
const UINT32_BYTES = 4
const TIFF_LE_SIGNATURE = '49492a00'
const TIFF_BE_SIGNATURE = '4d4d002a'

async function readHeifMetadata(buffer, opts = {}) {
  try {
    const heif = await import('bare-heif')
    const metadata = heif.getMetadata(buffer, {
      type: opts.exifOnly ? HEIF_METADATA_TYPE.EXIF : undefined
    })
    const data = {}

    for (const item of metadata) {
      switch (item.type) {
        case HEIF_METADATA_TYPE.EXIF: {
          if (item.data.byteLength) {
            data.exifRaw = Buffer.concat([EXIF_HEADER, item.data])
          }
          break
        }
        case HEIF_METADATA_TYPE.MIME:
          if (item.contentType === XMP_CONTENT_TYPE) {
            data.xmp = item.data.toString()
          } else {
            data.mime = data.mime || []
            data.mime.push({ contentType: item.contentType, data: item.data })
          }
          break
        case HEIF_METADATA_TYPE.URI:
          data.uri = data.uri || []
          data.uri.push({ uriType: item.uriType, data: item.data })
          break
        default:
          break
      }
    }

    return data
  } catch {
    return {}
  }
}

async function stripHEIFExif(payload, opts) {
  if (payload.byteLength < UINT32_BYTES) return null

  const tiffStart = UINT32_BYTES + payload.readUInt32BE(0)
  const tiffHeaderEnd = tiffStart + UINT32_BYTES
  if (tiffHeaderEnd > payload.byteLength) return null

  const signature = payload.toString('hex', tiffStart, tiffHeaderEnd)
  if (signature !== TIFF_LE_SIGNATURE && signature !== TIFF_BE_SIGNATURE) {
    return null
  }

  const exif = Buffer.concat([EXIF_HEADER, payload.subarray(tiffStart)])
  const stripped = await stripExif(exif, opts)
  if (!stripped) return null

  const strippedTiff = stripped.subarray(EXIF_HEADER.byteLength)

  return Buffer.concat([Buffer.alloc(UINT32_BYTES), strippedTiff])
}

async function stripHEIFMetadata(buffer, opts = {}) {
  const gpac = await import('bare-gpac')

  using file = new gpac.ISOFile(buffer)

  for (const item of file.items()) {
    if (item.type === HEIF_METADATA_TYPE.EXIF && opts.keepOrientation) {
      const data = await stripHEIFExif(file.readItem(item.id), opts)
      if (data) {
        file.eraseItemData(item.id)
        file.removeItem(item.id, { keepRefs: true })
        file.addItem(data, { id: item.id, type: HEIF_METADATA_TYPE.EXIF })
        continue
      }
    }

    if (
      item.type === HEIF_METADATA_TYPE.EXIF ||
      item.type === HEIF_METADATA_TYPE.URI ||
      (item.type === HEIF_METADATA_TYPE.MIME && item.contentType !== 'image/jpeg')
    ) {
      file.eraseItemData(item.id)
      file.removeItem(item.id)
    }
  }

  for (let box = file.findBox('sefd'); box; box = file.findBox('sefd')) {
    file.removeBox(box.id)
  }

  return file.write()
}

export { readHeifMetadata, stripHEIFMetadata }
