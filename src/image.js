import fs from 'bare-fs'
import fetch from 'bare-fetch'
import exif from 'bare-exif'

import { EXIF } from '../types.js'
import { importCodec, supportsQuality } from './codecs.js'
import { isHttpUrl, detectMimeType, calculateFitDimensions } from './util'

const animatableMimetypes = ['image/gif', 'image/webp']

async function read(input) {
  let buffer

  if (typeof input === 'string') {
    if (isHttpUrl(input)) {
      const response = await fetch(input)
      buffer = await response.buffer()
    } else {
      buffer = await fs.readFile(input)
    }
  } else {
    buffer = input
  }

  return buffer
}

async function save(filename, buffer, opts) {
  return fs.writeFile(filename, buffer, opts)
}

async function decode(buffer, opts = {}) {
  const { maxFrames = 0 } = opts

  let rgba

  const mimetype = detectMimeType(buffer)
  const codec = await importCodec(mimetype)

  if (animatableMimetypes.includes(mimetype)) {
    const { width, height, loops, frames } = codec.decodeAnimated(buffer)
    const data = []
    for (const frame of frames) {
      if (maxFrames > 0 && data.length >= maxFrames) break
      data.push(frame)
    }
    rgba = { width, height, loops, frames: data }
  } else {
    rgba = codec.decode(buffer)
  }

  return rgba
}

async function encode(rgba, opts = {}) {
  const { mimetype, maxBytes, ...codecOpts } = opts

  let encoded = await _encodeRGBA(rgba, mimetype, codecOpts)

  if (maxBytes) {
    if (encoded.byteLength > maxBytes && supportsQuality(mimetype)) {
      const MIN_QUALITY = 50
      for (let quality = 80; quality >= MIN_QUALITY; quality -= 15) {
        encoded = await _encodeRGBA(rgba, mimetype, { quality })
        if (encoded.byteLength <= maxBytes) {
          break
        }
      }
    }

    if (encoded.byteLength > maxBytes && rgba.frames?.length > 1) {
      const quality = 75

      for (const dropEvery of [4, 3, 2]) {
        const frames = rgba.frames.filter((frame, index) => index % dropEvery !== 0)
        const filtered = { ...rgba, frames }
        encoded = await _encodeRGBA(filtered, mimetype, { quality })
        if (encoded.byteLength <= maxBytes) {
          break
        }
      }

      if (encoded.byteLength > maxBytes) {
        const frames = rgba.frames.slice(0, 50).filter((frame, index) => index % 2 === 0)
        const capped = { ...rgba, frames }
        encoded = await _encodeRGBA(capped, mimetype, { quality })
      }

      if (encoded.byteLength > maxBytes) {
        const oneFrame = { ...rgba, frames: rgba.frames.slice(0, 1) }
        encoded = await _encodeRGBA(oneFrame, mimetype)
      }
    }

    if (encoded.byteLength > maxBytes) {
      throw new Error(
        `Could not create preview under maxBytes, reached ${encoded.byteLength} bytes`
      )
    }
  }

  return encoded
}

async function crop(rgba, opts = {}) {
  const { left, top, width, height } = opts

  if (
    left < 0 ||
    top < 0 ||
    width <= 0 ||
    height <= 0 ||
    left + width > rgba.width ||
    top + height > rgba.height
  ) {
    throw new Error('Crop rectangle out of bounds')
  }

  if (
    !Number.isInteger(left) ||
    !Number.isInteger(top) ||
    !Number.isInteger(width) ||
    !Number.isInteger(height)
  ) {
    throw new Error('Crop rectangle coordinates must be integers')
  }

  const data = Buffer.alloc(width * height * 4)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIndex = ((y + top) * rgba.width + (x + left)) * 4
      const dstIndex = (y * width + x) * 4

      data[dstIndex] = rgba.data[srcIndex]
      data[dstIndex + 1] = rgba.data[srcIndex + 1]
      data[dstIndex + 2] = rgba.data[srcIndex + 2]
      data[dstIndex + 3] = rgba.data[srcIndex + 3]
    }
  }

  return { width, height, data }
}

async function resize(rgba, opts = {}) {
  const { maxWidth, maxHeight } = opts
  const { width, height } = rgba

  let maybeResizedRGBA

  if (maxWidth && maxHeight && (width > maxWidth || height > maxHeight)) {
    const { resize } = await import('bare-image-resample')
    const dimensions = calculateFitDimensions(width, height, maxWidth, maxHeight)
    if (Array.isArray(rgba.frames)) {
      const frames = []
      for (const frame of rgba.frames) {
        const resized = resize(frame, dimensions.width, dimensions.height)
        frames.push({ ...resized, timestamp: frame.timestamp })
      }
      maybeResizedRGBA = {
        width: frames[0].width,
        height: frames[0].height,
        loops: rgba.loops,
        frames
      }
    } else {
      maybeResizedRGBA = resize(rgba, dimensions.width, dimensions.height)
    }
  } else {
    maybeResizedRGBA = rgba
  }

  return maybeResizedRGBA
}

function slice(rgba, opts = {}) {
  if (Array.isArray(rgba.frames)) {
    let { start = 0, end = rgba.frames.length } = opts

    start = Math.max(0, start)
    end = Math.max(0, end)

    if (start >= end) {
      throw new Error('slice(): "start" must be less than "end"')
    }

    return {
      ...rgba,
      frames: rgba.frames.slice(start, end)
    }
  }

  return rgba
}

function rotate(rgba, opts = {}) {
  const { deg } = opts

  if (![0, 90, 180, 270].includes(deg)) {
    throw new Error('rotate(): deg can only be [0, 90, 180, 270]')
  }

  return _transform(rgba, { rotate: deg })
}

function flip(rgba, opts = {}) {
  const { x = true, y } = opts

  if (typeof x !== 'boolean' && typeof y !== 'boolean') {
    throw new Error('flip(): needs axis x or y to be a boolean')
  }

  return _transform(rgba, { flipX: x, flipY: y })
}

function orientate(rgba, input) {
  const exifData = new exif.Data(input)
  const orientation = exifData.entry(exif.constants.tags.ORIENTATION)

  let opts

  switch (orientation.read()) {
    case EXIF.ORIENTATION.NORMAL:
      break
    case EXIF.ORIENTATION.MIRROR_HORIZONTAL:
      opts = { flipX: true }
      break
    case EXIF.ORIENTATION.ROTATE_180:
      opts = { rotate: 180 }
      break
    case EXIF.ORIENTATION.MIRROR_VERTICAL:
      opts = { flipY: true }
      break
    case EXIF.ORIENTATION.TRANSPOSE:
      opts = { rotate: 90, flipX: true }
      break
    case EXIF.ORIENTATION.ROTATE_90:
      opts = { rotate: 90 }
      break
    case EXIF.ORIENTATION.TRANSVERSE:
      opts = { rotate: 270, flipX: true }
      break
    case EXIF.ORIENTATION.ROTATE_270:
      opts = { rotate: 270 }
      break
    default:
      break
  }

  if (!opts) return rgba

  return _transform(rgba, opts)
}

function _transform(rgba, opts) {
  const { rotate = 0, flipX = false, flipY = false } = opts

  if (rotate === 0 && !flipX && !flipY) return rgba

  const transformFrame = (frame) => {
    const srcWidth = frame.width
    const srcHeight = frame.height
    const dstWidth = rotate === 90 || rotate === 270 ? srcHeight : srcWidth
    const dstHeight = rotate === 90 || rotate === 270 ? srcWidth : srcHeight
    const data = Buffer.alloc(dstWidth * dstHeight * 4)

    for (let y = 0; y < srcHeight; y++) {
      for (let x = 0; x < srcWidth; x++) {
        const transformedX = flipX ? srcWidth - 1 - x : x
        const transformedY = flipY ? srcHeight - 1 - y : y

        let dstX
        let dstY

        switch (rotate) {
          case 90:
            dstX = srcHeight - 1 - transformedY
            dstY = transformedX
            break
          case 180:
            dstX = srcWidth - 1 - transformedX
            dstY = srcHeight - 1 - transformedY
            break
          case 270:
            dstX = transformedY
            dstY = srcWidth - 1 - transformedX
            break
          default:
            dstX = transformedX
            dstY = transformedY
            break
        }

        const srcIndex = (y * srcWidth + x) * 4
        const dstIndex = (dstY * dstWidth + dstX) * 4

        data[dstIndex] = frame.data[srcIndex]
        data[dstIndex + 1] = frame.data[srcIndex + 1]
        data[dstIndex + 2] = frame.data[srcIndex + 2]
        data[dstIndex + 3] = frame.data[srcIndex + 3]
      }
    }

    return { ...frame, width: dstWidth, height: dstHeight, data }
  }

  if (Array.isArray(rgba.frames)) {
    const frames = rgba.frames.map(transformFrame)
    return {
      ...rgba,
      width: frames[0].width,
      height: frames[0].height,
      frames
    }
  }

  return transformFrame(rgba)
}

async function _encodeRGBA(rgba, mimetype, opts) {
  const codec = await importCodec(mimetype)

  let encoded
  if (Array.isArray(rgba.frames)) {
    encoded = codec.encodeAnimated(rgba, opts)
  } else {
    encoded = codec.encode(rgba, opts)
  }

  return encoded
}

class ImagePipeline {
  constructor(input) {
    this.input = input
    this.steps = []

    const methods = ['decode', 'resize', 'crop', 'slice', 'orientate', 'rotate', 'flip', 'encode']
    for (let method of methods) {
      this[method] = (opts) => {
        this.steps.push({ op: method, opts })
        return this
      }
    }
  }

  async then(resolve, reject) {
    try {
      const inputBuffer = await read(this.input)

      let buffer = inputBuffer

      for (const step of this.steps) {
        if (step.op === 'decode') {
          buffer = await decode(buffer, step.opts)
        }

        if (step.op === 'resize') {
          buffer = await resize(buffer, step.opts)
        }

        if (step.op === 'crop') {
          buffer = await crop(buffer, step.opts)
        }

        if (step.op === 'slice') {
          buffer = slice(buffer, step.opts)
        }

        if (step.op === 'orientate') {
          buffer = await orientate(buffer, inputBuffer)
        }

        if (step.op === 'rotate') {
          buffer = await rotate(buffer, step.opts)
        }

        if (step.op === 'flip') {
          buffer = await flip(buffer, step.opts)
        }

        if (step.op === 'encode') {
          buffer = await encode(buffer, step.opts)
        }
      }

      resolve(buffer)
    } catch (err) {
      reject(err)
    }
  }

  async save(filename, opts) {
    const buffer = await this
    return save(filename, buffer, opts)
  }
}

function image(input) {
  return new ImagePipeline(input)
}

image.read = read
image.save = save
image.decode = decode
image.orientate = orientate
image.rotate = rotate
image.flip = flip
image.resize = resize
image.crop = crop
image.slice = slice
image.encode = encode

export { image }
