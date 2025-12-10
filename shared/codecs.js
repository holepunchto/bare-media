export const imageCodecs = {
  'image/jpeg': () => import('bare-jpeg'),
  'image/jpg': () => import('bare-jpeg'),
  'image/avif': () => import('bare-heif'),
  'image/heic': () => import('bare-heif'),
  'image/heif': () => import('bare-heif'),
  'image/webp': () => import('bare-webp'),
  'image/png': () => import('bare-png'),
  'image/tif': () => import('bare-tiff'),
  'image/tiff': () => import('bare-tiff'),
  'image/gif': () => import('bare-gif')
}

export const videoCodecs = {
  'video/mp4': () => true,
  'video/webm': () => true
}

export function isCodecSupported(mimetype) {
  return isImageCodecSupported(mimetype) || isVideoCodecSupported(mimetype)
}

export function isImageCodecSupported(mimetype) {
  return mimetype in imageCodecs
}

export function isVideoCodecSupported(mimetype) {
  return mimetype in videoCodecs
}

export async function importImageCodec(mimetype) {
  const codecImport = imageCodecs[mimetype]
  if (!codecImport) throw new Error(`No codec for ${mimetype}`)
  return await codecImport()
}

export function supportsQuality(mimetype) {
  return { 'image/webp': true, 'image/jpeg': true }[mimetype] || false
}
