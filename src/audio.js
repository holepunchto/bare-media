import fs from 'bare-fs'
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

async function withSources(inputs, fn) {
  const fds = []

  try {
    const sources = []

    for (const input of inputs) {
      assertInput(input)

      if (typeof input === 'string') {
        const fd = fs.openSync(input, 'r')
        fds.push(fd)
        sources.push(fd)
      } else {
        sources.push(input)
      }
    }

    return await fn(sources)
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
    return withSources([this.input], ([source]) => metadata(source))
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
        inputs = inputs.concat(step.inputs)
        opts = { ...opts, ...step.opts }
      }

      resolve(await withSources(inputs, (sources) => concat(sources, opts)))
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
