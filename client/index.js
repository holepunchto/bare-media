import HRPC from '../shared/spec/hrpc/index.js'
import { isCodecSupported } from '../shared/codecs.js'
import { spawn } from './cross-spawn/index.js'

export class WorkerClient {
  worker = null
  rpc = null
  opts = null

  constructor (opts) {
    this.initialize(opts)
  }

  initialize (opts) {
    this.opts = opts
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

  async createPreview (arg) {
    await this.run()
    return this.rpc.createPreview(arg)
  }

  async createPreviewAll (arg) {
    await this.run()
    return this.rpc.createPreviewAll(arg)
  }
}
