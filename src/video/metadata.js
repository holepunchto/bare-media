import { importFFmpeg } from '../codecs'
import { createIOContext } from './io'

const AV_TIME_BASE = 1000000

export async function metadata(fd) {
  const ffmpeg = await importFFmpeg()
  const io = createIOContext(fd, ffmpeg)

  using inputFormat = new ffmpeg.InputFormatContext(io)
  const stream = inputFormat.getBestStream(ffmpeg.constants.mediaTypes.VIDEO)

  if (!stream) throw new Error('No video stream found')

  let displayRotation = 0
  let correctiveRotation = 0
  let flipH = false
  let flipV = false

  for (const entry of stream.sideData) {
    if (entry.type === ffmpeg.constants.packetSideDataType.DISPLAYMATRIX) {
      const transform = parseDisplayMatrix(entry.data)
      if (transform) {
        displayRotation = transform.rotation
        flipH = transform.flipH
        flipV = transform.flipV
      }
      break
    }
  }

  correctiveRotation = ((-displayRotation % 360) + 360) % 360

  const { codec, codecParameters } = stream

  const duration = getDuration(inputFormat, stream)

  return {
    width: codecParameters.width,
    height: codecParameters.height,
    codec: {
      id: codec.id,
      name: codec.name
    },
    duration,
    avgFramerate: {
      numerator: stream.avgFramerate.numerator,
      denominator: stream.avgFramerate.denominator
    },
    displayRotation,
    rotation: correctiveRotation,
    flipH,
    flipV
  }
}

function getDuration(inputFormat, stream) {
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

/*
 * Parse the parts of a display matrix that affect orientation.
 *
 * A display matrix is normally applied to each pixel to determine how a frame
 * should be presented. Here we only need to extract the orientation we expose
 * in our metadata model: {rotation, flipH, flipV}.
 */
export function parseDisplayMatrix(matrix) {
  const a = snap(matrix.readInt32LE(0) / 65536)
  const b = snap(matrix.readInt32LE(4) / 65536)
  const c = snap(matrix.readInt32LE(12) / 65536)
  const d = snap(matrix.readInt32LE(16) / 65536)

  let rotation = 0
  let flipH = false
  let flipV = false

  const det = a * d - b * c

  if (det > 0) {
    // rotation only
    if (a === 1 && d === 1) rotation = 0
    else if (b === -1 && c === 1) rotation = 90
    else if (a === -1 && d === -1) rotation = 180
    else if (b === 1 && c === -1) rotation = 270
  } else {
    // reflection present
    if (a === -1 && d === 1) {
      flipH = true
    } else if (a === 1 && d === -1) {
      flipV = true
    } else if (b === 1 && c === 1) {
      rotation = 90
      flipH = true
    } else if (b === -1 && c === -1) {
      rotation = 90
      flipV = true
    }
  }

  return { rotation, flipH, flipV }
}

function snap(value, epsilon = 1e-3) {
  if (Math.abs(value - 1) < epsilon) return 1
  if (Math.abs(value + 1) < epsilon) return -1
  if (Math.abs(value) < epsilon) return 0
  return value
}
