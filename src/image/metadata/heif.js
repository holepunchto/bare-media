import { EXIF_HEADER, stripExif } from './exif'

const UINT32_BYTES = 4
const TIFF_LE_SIGNATURE = '49492a00'
const TIFF_BE_SIGNATURE = '4d4d002a'

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
    if (item.type === 'Exif' && opts.keepOrientation) {
      const data = await stripHEIFExif(file.readItem(item.id), opts)
      if (data) {
        file.eraseItemData(item.id)
        file.removeItem(item.id, { keepRefs: true })
        file.addItem(data, { id: item.id, type: 'Exif' })
        continue
      }
    }

    if (
      item.type === 'Exif' ||
      item.type === 'uri ' ||
      (item.type === 'mime' && item.contentType !== 'image/jpeg')
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

export { stripHEIFMetadata }
