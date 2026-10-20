import fs from 'bare-fs'
import { metadata } from './audio/metadata'

class AudioPipeline {
  constructor(input) {
    this.input = input
  }

  async metadata() {
    const fd = fs.openSync(this.input, 'r')
    try {
      return await metadata(fd)
    } finally {
      fs.closeSync(fd)
    }
  }
}

function audio(input) {
  return new AudioPipeline(input)
}

audio.metadata = metadata

export { audio }
