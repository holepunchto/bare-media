import HRPC from '../shared/spec/hrpc/index.js'
import { isCodecSupported } from '../shared/codecs.js'
import { spawn } from './cross-spawn/index.js'

export class WorkerClient {
  worker = null
  rpc = null
  opts = null

  constructor (opts) {
    this.initialize(opts)
    this.#createMethods()
  }

  initialize (opts) {
    this.opts = opts
  }

  #createMethods () {
    const methods = ['createPreview', 'createPreviewAll']

    for (const method of methods) {
      this[method] = async (...args) => {
        await this.ensureWorker()
        return this.rpc[method](...args)
      }
    }
  }

  async ensureWorker () {
    if (this.worker !== null) return
    await this.run()
  }

  async run () {
    if (this.worker !== null) return

    this.worker = await spawn(this.opts)
    const pipe = this.worker.IPC

    pipe.on('end', () => pipe.end())
    pipe.on('close', () => {
      this.rpc = null
    })

    this.rpc = new HRPC(pipe)
  }

  isCodecSupported (mimetype) {
    return isCodecSupported(mimetype)
  }
}
