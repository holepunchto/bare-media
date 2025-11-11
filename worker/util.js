import getMimeType from 'get-mime-type'
import getFileFormat from 'get-file-format'

export const log = (...args) => console.log('[bare-media]', ...args)

export function detectMimeType(buffer, path) {
  return getMimeType(getFileFormat(buffer)) || getMimeType(path)
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
