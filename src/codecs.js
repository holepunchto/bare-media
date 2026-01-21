import { IMAGE } from '../types'

export const codecs = {
  [IMAGE.AVIF]: () => import('bare-heif'),
  [IMAGE.GIF]: () => import('bare-gif'),
  [IMAGE.BMP]: () => import('bare-bmp'),
  [IMAGE.HEIC]: () => import('bare-heif'),
  [IMAGE.HEIF]: () => import('bare-heif'),
  [IMAGE.JPEG]: () => import('bare-jpeg'),
  [IMAGE.JPG]: () => import('bare-jpeg'),
  [IMAGE.PNG]: () => import('bare-png'),
  [IMAGE.TIF]: () => import('bare-tiff'),
  [IMAGE.TIFF]: () => import('bare-tiff'),
  [IMAGE.WEBP]: () => import('bare-webp'),
  [IMAGE.X_MS_BMP]: () => import('bare-bmp')
}

export async function importCodec(mimetype) {
  const codecImport = codecs[mimetype]
  if (!codecImport) throw new Error(`Unsupported file type: No codec available for ${mimetype}`)
  return await codecImport()
}

export function supportsQuality(mimetype) {
  return { 'image/webp': true, 'image/jpeg': true }[mimetype] || false
}

const videoMimetypes = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-matroska',
  'video/x-msvideo'
]

export function isImageSupported(mimetype) {
  return mimetype in codecs
}

export function isVideoSupported(mimetype) {
  return videoMimetypes.includes(mimetype)
}

export function isMediaSupported(mimetype) {
  return isImageSupported(mimetype) || isVideoSupported(mimetype)
}
