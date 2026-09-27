const EXIF_HEADER = Buffer.from('Exif\0\0')

async function stripExif(buffer, opts = {}) {
  const exif = await import('bare-exif')
  const tags = exif.constants.tags

  using data = new exif.Data(buffer)

  for (const tag of Object.values(tags)) {
    if (!opts.keepOrientation || tag !== tags.ORIENTATION) {
      data.removeEntry(tag)
    }
  }

  return Buffer.from(data.saveData())
}

export { EXIF_HEADER, stripExif }
