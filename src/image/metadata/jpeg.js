import { stripExif } from './exif'

async function stripJPEGMetadata(buffer, opts = {}) {
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
    const data = await stripExif(buffer, opts)
    if (data) {
      newMarkers.push({ marker: APP1, data })
    }
  }

  return jpeg.replaceMarkers(buffer, newMarkers)
}

export { stripJPEGMetadata }
