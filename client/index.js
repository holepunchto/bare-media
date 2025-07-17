import HRPC from '../shared/spec/hrpc/index.js'
import { isCodecSupported } from '../shared/codecs.js'
import { spawn } from './cross-spawn/index.js'

export class WorkerClient {
  worker = null
  rpc = null
  opts = null

  constructor (opts) {
    this.initialize(opts)
    this.#attachMethods()
  }

  initialize (opts) {
    const sourcePath = 'node_modules/@holepunchto/keet-compute/worker/index.js'
    this.opts = { sourcePath, ...opts }
  }

  #attachMethods () {
    const methods = [
      'createPreview',
      'createPreviewAll'
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

    this.worker = await spawn(this.opts)
    const ipc = this.worker.IPC

    ipc.on('end', () => ipc.end())
    ipc.on('close', () => this.onClose?.())

    this.rpc = new HRPC(ipc)
  }

  isCodecSupported (mimetype) {
    return isCodecSupported(mimetype)
  }
}
