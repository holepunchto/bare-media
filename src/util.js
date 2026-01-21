import fs from 'bare-fs'
import fetch from 'bare-fetch'
import getMimeType from 'get-mime-type'
import getFileFormat from 'get-file-format'

export async function getBuffer({ path, httpLink, buffer }) {
  if (buffer) return buffer

  if (path) {
    return fs.readFileSync(path)
  }

  if (httpLink) {
    const response = await fetch(httpLink)
    return await response.buffer()
  }

  throw new Error('At least one of "path", "httpLink" or "buffer" must be provided')
}

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

export function isHttpUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
