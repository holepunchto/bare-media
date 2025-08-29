import HRPC from '../shared/spec/hrpc/index.js'
import { isCodecSupported } from '../shared/codecs.js'
import { spawn } from './cross-spawn/index.js'

export class WorkerClient {
  worker = null
  rpc = null
  opts = null
  running = false

  constructor (opts) {
    this.initialize(opts)
    this.#attachMethods()
  }

  initialize (opts) {
    const sourcePath = 'node_modules/bare-media/worker/index.js'
    this.opts = { sourcePath, ...opts }
  }

  #attachMethods () {
    const methods = [
      'createPreview',
      'decodeImage'
    ]

    for (const method of methods) {
      this[method] = async (...args) => {
        await this.ensureWorker()
        return this.rpc[method](...args)
      }
    }
  }

  async ensureWorker () {
    await this.run()

    const MAX_RETRIES = 1000
    const RETRY_DELAY = 10

    let i = 0
    while (!this.worker && i < MAX_RETRIES) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY))
      i += 1
    }

    if (!this.worker) {
      throw new Error('Could not spawn the worker')
    }
  }

  async run () {
    if (this.running) return
    this.running = true

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
