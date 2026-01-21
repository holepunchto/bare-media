export const codecs = {
  'image/jpeg': () => import('bare-jpeg'),
  'image/jpg': () => import('bare-jpeg'),
  'image/avif': () => import('bare-heif'),
  'image/heic': () => import('bare-heif'),
  'image/heif': () => import('bare-heif'),
  'image/webp': () => import('bare-webp'),
  'image/png': () => import('bare-png'),
  'image/tif': () => import('bare-tiff'),
  'image/tiff': () => import('bare-tiff'),
  'image/gif': () => import('bare-gif'),
  'image/bmp': () => import('bare-bmp'),
  'image/x-ms-bmp': () => import('bare-bmp')
}

export const videoMimetypes = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-matroska',
  'video/x-msvideo'
]

export function isImageSupported(mimetype) {
  return mimetype in codecs
}

/** @deprecated Use isImageSupported instead */
export const isCodecSupported = isImageSupported

export function isVideoSupported(mimetype) {
  return videoMimetypes.includes(mimetype)
}

export function isMediaSupported(mimetype) {
  return isImageSupported(mimetype) || isVideoSupported(mimetype)
}

export async function importCodec(mimetype) {
  const codecImport = codecs[mimetype]
  if (!codecImport) throw new Error(`No codec for ${mimetype}`)
  return await codecImport()
}

export function supportsQuality(mimetype) {
  return { 'image/webp': true, 'image/jpeg': true }[mimetype] || false
}
