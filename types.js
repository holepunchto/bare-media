export const IMAGE = {
  AVIF: 'image/avif',
  GIF: 'image/gif',
  BMP: 'image/bmp',
  HEIC: 'image/heic',
  HEIF: 'image/heif',
  JPEG: 'image/jpeg',
  JPG: 'image/jpg',
  PNG: 'image/png',
  TIF: 'image/tif',
  TIFF: 'image/tiff',
  WEBP: 'image/webp',
  X_MS_BMP: 'image/bmp'
}

export const supportedImageMimetypes = Object.values(IMAGE)

export const supportedVideoMimetypes = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-matroska',
  'video/x-msvideo'
]

export function isImageSupported(mimetype) {
  return supportedImageMimetypes.includes(mimetype)
}

export function isVideoSupported(mimetype) {
  return supportedVideoMimetypes.includes(mimetype)
}

export function isMediaSupported(mimetype) {
  return isImageSupported(mimetype) || isVideoSupported(mimetype)
}
