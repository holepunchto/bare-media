import { withFileDescriptor } from './ffmpeg'
import { metadata } from './audio/metadata'

class AudioPipeline {
  constructor(input) {
    this.input = input
  }

  async metadata() {
    return withFileDescriptor(this.input, metadata)
  }
}

function audio(input) {
  return new AudioPipeline(input)
}

audio.metadata = metadata

export { audio }
