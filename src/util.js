import getMimeType from 'get-mime-type'
import getFileFormat from 'get-file-format'

export function detectMimeType(buffer) {
  return getMimeType(getFileFormat(buffer))
}

export function calculateFitDimensions(width, height, maxWidth, maxHeight) {
  if (width <= maxWidth && height <= maxHeight) {
    return { width, height }
  }

  const widthRatio = maxWidth / width
  const heightRatio = maxHeight / height
  const ratio = Math.min(widthRatio, heightRatio)

  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio)
  }
}

export function isImage(buffer) {
  return detectMimeType(buffer).startsWith('image/')
}

export function isVideo(buffer) {
  return detectMimeType(buffer).startsWith('video/')
}

export function isHttpUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
