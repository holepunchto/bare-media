import fs from 'bare-fs'
import { withFileDescriptor, withOutputFileDescriptor } from './ffmpeg'
import { metadata } from './audio/metadata'
import { concat } from './audio/concat'

class AudioPipeline {
  constructor(input) {
    this.input = input
  }

  async metadata() {
    return withFileDescriptor(this.input, metadata)
  }

  async concat(output, opts) {
    const paths = Array.isArray(this.input) ? this.input : [this.input]
    const inputs = []

    try {
      for (const path of paths) inputs.push(fs.openSync(path, 'r'))

      return await withOutputFileDescriptor(output, (fd) => concat(inputs, fd, opts))
    } finally {
      for (const fd of inputs) fs.closeSync(fd)
    }
  }
}

function audio(input) {
  return new AudioPipeline(input)
}

audio.metadata = metadata
audio.concat = concat

export { audio }
