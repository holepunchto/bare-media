import fs from 'bare-fs'
import fetch from 'bare-fetch'

import { importCodec, supportsQuality } from './codecs.js'
import { detectMimeType, calculateFitDimensions } from './util'

const animatableMimetypes = ['image/gif', 'image/webp']

async function read(input) {
  let buffer

  if (typeof input === 'string') {
    if (input.startsWith('http')) {
      const response = await fetch(input)
      buffer = await response.buffer()
    } else {
      buffer = fs.readFileSync(input)
    }
  } else {
    buffer = input
  }

  return buffer
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

async function encode(rgba, mimetype, opts = {}) {
  const { maxBytes, ...codecOpts } = opts

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
  }

  decode(opts) {
    this.steps.push({ op: 'decode', opts })
    return this
  }

  resize(opts) {
    this.steps.push({ op: 'resize', opts })
    return this
  }

  crop(opts) {
    this.steps.push({ op: 'crop', opts })
    return this
  }

  slice(opts) {
    this.steps.push({ op: 'slice', opts })
    return this
  }

  async encode(opts) {
    let buffer = await read(this.input)

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
    }

    return encode(buffer, opts)
  }
}

function image(input) {
  return new ImagePipeline(input)
}

image.read = read
image.decode = decode
image.resize = resize
image.crop = crop
image.slice = slice
image.encode = encode

export { image }
