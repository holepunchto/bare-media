import { importFFmpeg, createIOContext, getDuration } from '../ffmpeg'

export async function metadata(fd) {
  const ffmpeg = await importFFmpeg()
  const io = createIOContext(fd, ffmpeg)

  using inputFormat = new ffmpeg.InputFormatContext(io)
  const stream = inputFormat.getBestStream(ffmpeg.constants.mediaTypes.AUDIO)

  if (!stream) throw new Error('No audio stream found')

  const { codec, codecParameters } = stream

  return {
    codec: { id: codec.id, name: codec.name },
    duration: getDuration(inputFormat, stream),
    sampleRate: codecParameters.sampleRate,
    channels: codecParameters.channelLayout.nbChannels,
    bitRate: codecParameters.bitRate
  }
}
