import getMimeType from 'get-mime-type'
import getFileFormat from 'get-file-format'

import { IMAGE } from '../types'

export const codecs = {
  [IMAGE.AVIF]: () => import('bare-heif'),
  [IMAGE.BMP]: () => import('bare-bmp'),
  [IMAGE.GIF]: () => import('bare-gif'),
  [IMAGE.HEIC]: () => import('bare-heif'),
  [IMAGE.HEIF]: () => import('bare-heif'),
  [IMAGE.JPEG]: () => import('bare-jpeg'),
  [IMAGE.JPG]: () => import('bare-jpeg'),
  [IMAGE.PNG]: () => import('bare-png'),
  [IMAGE.SVG_XML]: () => import('bare-svg'),
  [IMAGE.TIF]: () => import('bare-tiff'),
  [IMAGE.TIFF]: () => import('bare-tiff'),
  [IMAGE.VND_MS_ICON]: () => import('bare-ico'),
  [IMAGE.WEBP]: () => import('bare-webp'),
  [IMAGE.X_ICON]: () => import('bare-ico'),
  [IMAGE.X_MS_BMP]: () => import('bare-bmp')
}

export async function importCodec(mimetype) {
  const codecImport = codecs[mimetype]
  if (!codecImport) throw new Error(`Unsupported file type: No codec available for ${mimetype}`)
  try {
    return await codecImport()
  } catch (err) {
    console.log(err)
    throw new Error(`Failed to import codec for ${mimetype}`, { cause: err })
  }
}

export async function importFFmpeg() {
  try {
    return await import('bare-ffmpeg')
  } catch (err) {
    console.log(err)
    throw new Error('Failed to import bare-ffmpeg', { cause: err })
  }
}

export function supportsQuality(mimetype) {
  return { 'image/webp': true, 'image/jpeg': true }[mimetype] || false
}

export function detectMimeType(buffer) {
  return getMimeType(getFileFormat(buffer))
}

detectMimeType.fromPath = async function (path) {
  const { format, tracks } = await getFileFormat.fromPath(path, { inspect: true })
  const mimetype = getMimeType(format)

  // Only return the mimetype when the detection reliable enough
  if (mimetype === 'application/octet-stream') return null
  if (tracks && mimetype?.startsWith('audio/') && !tracks.audio) return null
  if (tracks && mimetype?.startsWith('video/') && !tracks.video) return null

  return mimetype
}
