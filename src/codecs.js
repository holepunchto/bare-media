export const codecs = {
  'image/avif': () => import('bare-heif'),
  'image/gif': () => import('bare-gif'),
  'image/heic': () => import('bare-heif'),
  'image/heif': () => import('bare-heif'),
  'image/jpeg': () => import('bare-jpeg'),
  'image/jpg': () => import('bare-jpeg'),
  'image/png': () => import('bare-png'),
  'image/tif': () => import('bare-tiff'),
  'image/tiff': () => import('bare-tiff'),
  'image/webp': () => import('bare-webp'),
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

export function isVideoSupported(mimetype) {
  return videoMimetypes.includes(mimetype)
}

export function isMediaSupported(mimetype) {
  return isImageSupported(mimetype) || isVideoSupported(mimetype)
}

export async function importCodec(mimetype) {
  const codecImport = codecs[mimetype]
  if (!codecImport) throw new Error(`Unsupported file type: No codec available for ${mimetype}`)
  return await codecImport()
}

export function supportsQuality(mimetype) {
  return { 'image/webp': true, 'image/jpeg': true }[mimetype] || false
}
