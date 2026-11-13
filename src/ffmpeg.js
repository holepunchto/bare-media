import fs from 'bare-fs'

const AV_TIME_BASE = 1000000
const INITIAL_OUTPUT_CAPACITY = 64 * 1024

export async function importFFmpeg() {
  try {
    return await import('bare-ffmpeg')
  } catch (err) {
    console.log(err)
    throw new Error('Failed to import bare-ffmpeg', { cause: err })
  }
}

export function createIOContext(input, ffmpeg) {
  const source = createInputSource(input)
  let offset = 0

  return new ffmpeg.IOContext(4096, {
    onread: (buffer, requested) => {
      const read = source.read(buffer, requested, offset)
      offset += read
      return read
    },
    onseek: (o, whence) => {
      if (whence === ffmpeg.constants.seek.SIZE) return source.size
      if (whence === ffmpeg.constants.seek.SET) offset = o
      else if (whence === ffmpeg.constants.seek.CUR) offset += o
      else if (whence === ffmpeg.constants.seek.END) offset = source.size + o
      else return -1
      return offset
    }
  })
}

function createInputSource(input) {
  if (input instanceof Uint8Array) return createBufferSource(input)

  assertFileDescriptor(input)
  return createFileSource(input)
}

function createFileSource(fd) {
  return {
    size: fs.fstatSync(fd).size,
    read: (buffer, requested, offset) => fs.readSync(fd, buffer, 0, requested, offset)
  }
}

function createBufferSource(bytes) {
  const size = bytes.byteLength

  return {
    size,
    read: (buffer, requested, offset) => {
      if (offset < 0 || offset >= size) return 0
      const chunk = bytes.subarray(offset, Math.min(offset + requested, size))
      buffer.set(chunk)
      return chunk.byteLength
    }
  }
}

export function createMemoryOutputIOContext(ffmpeg) {
  let storage = Buffer.alloc(INITIAL_OUTPUT_CAPACITY)
  let size = 0
  let offset = 0

  const io = new ffmpeg.IOContext(4096, {
    onwrite: (chunk) => {
      const end = offset + chunk.length
      if (end > storage.length) storage = grow(storage, end, size)
      storage.set(chunk, offset)
      offset = end
      size = Math.max(size, end)
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

  return { io, toBuffer: () => storage.subarray(0, size) }
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

export async function* withFileDescriptorStream(input, fn) {
  const fd = fs.openSync(input, 'r')
  try {
    yield* fn(fd)
  } finally {
    fs.closeSync(fd)
  }
}

function grow(storage, required, used) {
  let capacity = storage.length * 2
  while (capacity < required) capacity *= 2

  const grown = Buffer.alloc(capacity)
  storage.copy(grown, 0, 0, used)
  return grown
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
