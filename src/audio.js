import fs from 'bare-fs'
import { withFileDescriptor } from './ffmpeg'
import { metadata } from './audio/metadata'
import { concat } from './audio/concat'

function assertInput(input) {
  if (typeof input === 'string' || input instanceof Uint8Array) return
  throw new TypeError('Input must be a file path or a buffer')
}

async function read(input) {
  assertInput(input)
  if (typeof input === 'string') return await fs.readFile(input)
  return input
}

class AudioPipeline {
  constructor(input) {
    this.input = input
    this.steps = []
  }

  async metadata() {
    assertInput(this.input)
    if (typeof this.input === 'string') return withFileDescriptor(this.input, metadata)
    return metadata(this.input)
  }

  concat(inputs, opts) {
    this.steps.push({ op: 'concat', inputs, opts })
    return this
  }

  async then(resolve, reject) {
    try {
      if (this.steps.length === 0) return resolve(await read(this.input))

      let inputs = this.input === undefined ? [] : [this.input]
      let opts = {}

      for (const step of this.steps) {
        if (step.op === 'concat') {
          inputs = inputs.concat(step.inputs)
          opts = { ...opts, ...step.opts }
        }
      }

      const buffers = []
      for (const input of inputs) buffers.push(await read(input))

      resolve(await concat(buffers, opts))
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

audio.read = read
audio.metadata = metadata
audio.concat = concat

export { audio }
