const EXIF_HEADER = Buffer.from('Exif\0\0')

// Copy the buffer so it remains valid after exif.Data is destroyed
function readEntry(entry) {
  const value = entry.read()
  return Buffer.isBuffer(value) ? Buffer.from(value) : value
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
    using exifData = new exif.Data(buffer)
    const entry = exifData.entry(resolveExifTag(exif, tag))
    return entry ? readEntry(entry) : undefined
  } catch {
    return null
  }
}

async function exifMetadata(buffer) {
  const data = {}

  try {
    const exif = await import('bare-exif')
    using exifData = new exif.Data(buffer)
    for (const [name, tag] of Object.entries(exif.constants.tags)) {
      const entry = exifData.entry(tag)
      if (!entry) continue
      data[name] = readEntry(entry)
    }
  } finally {
    return data
  }
}

async function stripExif(buffer, opts = {}) {
  if (!opts.keepOrientation) return null

  const exif = await import('bare-exif')
  const tags = exif.constants.tags

  using data = new exif.Data(buffer)

  if (!data.entry(tags.ORIENTATION)) return null

  for (const tag of Object.values(tags)) {
    if (!opts.keepOrientation || tag !== tags.ORIENTATION) {
      data.removeEntry(tag)
    }
  }

  return Buffer.from(data.saveData())
}

export { EXIF_HEADER, exifValue, exifMetadata, stripExif }
