import { spawn } from 'cross-worker/client'

import HRPC from './shared/spec/hrpc/index.js'
import { isCodecSupported } from './shared/codecs.js'

export class WorkerClient {
  worker = null
  rpc = null
  opts = null

  constructor (opts) {
    this.initialize(opts)
    this.#attachMethods()
  }

  initialize ({ filename = 'node_modules/bare-media/worker/index.js', requireSource, args } = {}) {
    this.opts = { filename, requireSource, args }
  }

  #attachMethods () {
    const methods = [
      'createPreview',
      'decodeImage'
    ]

    for (const method of methods) {
      this[method] = async (...args) => {
        await this.run()
        return this.rpc[method](...args)
      }
    }
  }

  async run () {
    if (this.worker !== null) {
      return
    }

    const { filename, requireSource, args } = this.opts
    const source = requireSource?.()
    this.worker = await spawn(filename, source, args)
    const ipc = this.worker.IPC

    ipc.on('end', () => ipc.end())
    ipc.on('close', () => this.onClose?.())

    this.rpc = new HRPC(ipc)
  }

  isCodecSupported (mimetype) {
    return isCodecSupported(mimetype)
  }
}
