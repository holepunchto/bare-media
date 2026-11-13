import { importFFmpeg, createIOContext, createMemoryOutputIOContext } from '../ffmpeg'

const REFERENCE_SEGMENT = 0

export async function concat(inputs, opts = {}) {
  const { format = 'ipod' } = opts
  const fds = toFileDescriptors(inputs)
  const ffmpeg = await importFFmpeg()
  const sources = []

  try {
    for (const fd of fds) sources.push(openAudioSource(fd, ffmpeg))
    assertSameAudioParameters(sources)

    return remux(sources, format, ffmpeg)
  } finally {
    for (const source of sources) source.format.destroy()
  }
}

function toFileDescriptors(inputs) {
  const fds = Array.isArray(inputs) ? inputs : [inputs]

  if (!fds.every(isFileDescriptor)) {
    throw new TypeError('Inputs must be a file descriptor or an array of file descriptors')
  }

  if (fds.length === 0) {
    throw new Error('At least one input is required')
  }

  return fds
}

function isFileDescriptor(fd) {
  return Number.isInteger(fd) && fd >= 0
}

function openAudioSource(fd, ffmpeg) {
  const format = new ffmpeg.InputFormatContext(createIOContext(fd, ffmpeg))
  const stream = format.getBestStream(ffmpeg.constants.mediaTypes.AUDIO)

  if (!stream) {
    format.destroy()
    throw new Error('No audio stream found')
  }

  return { format, stream }
}

function assertSameAudioParameters(sources) {
  const referenceSource = sources[REFERENCE_SEGMENT]

  if (!referenceSource) {
    throw new Error(`Segment ${REFERENCE_SEGMENT} is missing`)
  }

  const reference = referenceSource.stream.codecParameters

  for (let i = REFERENCE_SEGMENT + 1; i < sources.length; i++) {
    const parameters = sources[i].stream.codecParameters

    if (
      parameters.id !== reference.id ||
      parameters.sampleRate !== reference.sampleRate ||
      parameters.nbChannels !== reference.nbChannels
    ) {
      throw new Error(
        `Segment ${i} does not match segment ${REFERENCE_SEGMENT} (codec, sample rate or channel count differ)`
      )
    }
  }
}

function remux(sources, format, ffmpeg) {
  const output = createMemoryOutputIOContext(ffmpeg)
  using outputFormat = new ffmpeg.OutputFormatContext(format, output.io)
  const outputStream = outputFormat.createStream()

  copyCodecParameters(sources[REFERENCE_SEGMENT].stream, outputStream)
  outputFormat.writeHeader()

  const timeBase = outputStream.timeBase
  using packet = new ffmpeg.Packet()
  let offset = 0

  for (const { format: inputFormat, stream } of sources) {
    let start = null
    let end = offset

    while (inputFormat.readFrame(packet)) {
      if (packet.streamIndex === stream.index) {
        packet.rescaleTimestamps(stream.timeBase, timeBase)
        start ??= packet.dts
        packet.dts = packet.dts - start + offset
        packet.pts = packet.pts - start + offset
        end = Math.max(end, packet.dts + packet.duration)
        packet.streamIndex = outputStream.index
        outputFormat.writeFrame(packet)
      }
      packet.unref()
    }

    offset = end
  }

  outputFormat.writeTrailer()

  return output.toBuffer()
}

function copyCodecParameters(inputStream, outputStream) {
  using decoder = inputStream.decoder()

  outputStream.codecParameters.fromContext(decoder)
  // The input's codec tag may not be valid in the output container, 0 lets the muxer pick
  outputStream.codecParameters.tag = 0
  outputStream.timeBase = inputStream.timeBase
}
