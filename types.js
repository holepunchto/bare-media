export const IMAGE = {
  AVIF: 'image/avif',
  BMP: 'image/bmp',
  GIF: 'image/gif',
  HEIC: 'image/heic',
  HEIF: 'image/heif',
  JPEG: 'image/jpeg',
  JPG: 'image/jpg',
  PNG: 'image/png',
  SVG_XML: 'image/svg+xml',
  TIF: 'image/tif',
  TIFF: 'image/tiff',
  VND_MS_ICON: 'image/vnd.microsoft.icon',
  WEBP: 'image/webp',
  X_ICON: 'image/x-icon',
  X_MS_BMP: 'image/x-ms-bmp'
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
