import fs from 'bare-fs'
import { withFileDescriptor } from './ffmpeg'
import { metadata } from './audio/metadata'
import { concat } from './audio/concat'

async function concatFiles(paths, opts) {
  const fds = []

  try {
    for (const path of paths) fds.push(fs.openSync(path, 'r'))

    return await concat(fds, opts)
  } finally {
    for (const fd of fds) fs.closeSync(fd)
  }
}

class AudioPipeline {
  constructor(input) {
    this.input = input
    this.steps = []
  }

  async metadata() {
    return withFileDescriptor(this.input, metadata)
  }

  concat(inputs, opts) {
    this.steps.push({ op: 'concat', inputs: Array.isArray(inputs) ? inputs : [inputs], opts })
    return this
  }

  async then(resolve, reject) {
    try {
      if (this.steps.length === 0) return resolve(await fs.readFile(this.input))

      const paths = this.input === undefined ? [] : [this.input]
      let opts = {}

      for (const step of this.steps) {
        paths.push(...step.inputs)
        opts = { ...opts, ...step.opts }
      }

      resolve(await concatFiles(paths, opts))
    } catch (err) {
      reject(err)
    }
  }

  async save(filename, opts) {
    const buffer = await this
    return fs.writeFile(filename, buffer, opts)
  }
}

function audio(input) {
  return new AudioPipeline(input)
}

audio.metadata = metadata
audio.concat = concat

export { audio }
