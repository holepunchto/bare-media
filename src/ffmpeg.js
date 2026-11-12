import fs from 'bare-fs'

const AV_TIME_BASE = 1000000

export async function importFFmpeg() {
  try {
    return await import('bare-ffmpeg')
  } catch (err) {
    console.log(err)
    throw new Error('Failed to import bare-ffmpeg', { cause: err })
  }
}

export function createIOContext(fd, ffmpeg) {
  assertFileDescriptor(fd)

  const fileSize = fs.fstatSync(fd).size
  let offset = 0

  return new ffmpeg.IOContext(4096, {
    onread: (buffer, requested) => {
      const read = fs.readSync(fd, buffer, 0, requested, offset)
      if (read === 0) return 0
      offset += read
      return read
    },
    onseek: (o, whence) => {
      if (whence === ffmpeg.constants.seek.SIZE) return fileSize
      if (whence === ffmpeg.constants.seek.SET) offset = o
      else if (whence === ffmpeg.constants.seek.CUR) offset += o
      else if (whence === ffmpeg.constants.seek.END) offset = fileSize + o
      else return -1
      return offset
    }
  })
}

export function createOutputIOContext(fd, ffmpeg) {
  assertFileDescriptor(fd)

  let size = 0
  let offset = 0

  return new ffmpeg.IOContext(4096, {
    onwrite: (chunk) => {
      fs.writeSync(fd, chunk, 0, chunk.length, offset)
      offset += chunk.length
      size = Math.max(size, offset)
      return chunk.length
    },
    onseek: (o, whence) => {
      if (whence === ffmpeg.constants.seek.SIZE) return size
      if (whence === ffmpeg.constants.seek.SET) offset = o
      else if (whence === ffmpeg.constants.seek.CUR) offset += o
      else if (whence === ffmpeg.constants.seek.END) offset = size + o
      else return -1
      return offset
    }
  })
}

export function getDuration(inputFormat, stream) {
  const streamDuration = getStreamDuration(stream)
  if (streamDuration > 0) return streamDuration

  const formatDuration = getFormatDuration(inputFormat)
  if (formatDuration > 0) return formatDuration

  return 0
}

export async function withFileDescriptor(input, fn) {
  const fd = fs.openSync(input, 'r')
  try {
    return await fn(fd)
  } finally {
    fs.closeSync(fd)
  }
}

export async function withOutputFileDescriptor(output, fn) {
  const fd = fs.openSync(output, 'w')
  let result

  try {
    result = await fn(fd)
  } catch (err) {
    fs.closeSync(fd)
    fs.unlinkSync(output)
    throw err
  }

  fs.closeSync(fd)
  return result
}

export async function* withFileDescriptorStream(input, fn) {
  const fd = fs.openSync(input, 'r')
  try {
    yield* fn(fd)
  } finally {
    fs.closeSync(fd)
  }
}

function assertFileDescriptor(fd) {
  if (fd === undefined || fd === null) {
    throw new Error('File descriptor is required')
  }
}

function getStreamDuration(stream) {
  if (!Number.isFinite(stream.duration) || stream.timeBase.denominator === 0) {
    return 0
  }

  return (stream.duration * stream.timeBase.numerator) / stream.timeBase.denominator
}

function getFormatDuration(inputFormat) {
  if (!Number.isFinite(inputFormat.duration) || inputFormat.duration < 0) return 0

  return inputFormat.duration / AV_TIME_BASE
}
