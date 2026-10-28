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

export function getDuration(inputFormat, stream) {
  const streamDuration = getStreamDuration(stream)
  if (streamDuration > 0) return streamDuration

  const formatDuration = getFormatDuration(inputFormat)
  if (formatDuration > 0) return formatDuration

  return 0
}

function getStreamDuration(stream) {
  if (!Number.isFinite(stream.duration) || stream.timeBase.denominator === 0) {
    return stream.duration
  }

  return (stream.duration * stream.timeBase.numerator) / stream.timeBase.denominator
}

function getFormatDuration(inputFormat) {
  if (!Number.isFinite(inputFormat.duration) || inputFormat.duration < 0) return 0

  return inputFormat.duration / AV_TIME_BASE
}
