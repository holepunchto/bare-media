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
    const added = Array.isArray(inputs) ? [...inputs] : [inputs]
    const last = this.steps[this.steps.length - 1]

    if (last !== undefined && last.op === 'concat') {
      last.inputs.push(...added)
      last.opts = { ...last.opts, ...opts }
      return this
    }

    this.steps.push({ op: 'concat', inputs: added, opts })
    return this
  }

  async then(resolve, reject) {
    try {
      if (this.steps.length === 0) return resolve(await read(this.input))

      let buffer = this.input === undefined ? undefined : await read(this.input)

      for (const step of this.steps) {
        if (step.op === 'concat') {
          const buffers = buffer === undefined ? [] : [buffer]
          for (const input of step.inputs) buffers.push(await read(input))

          buffer = await concat(buffers, step.opts)
        }
      }

      resolve(buffer)
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
