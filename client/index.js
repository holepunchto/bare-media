import HRPC from '../shared/spec/hrpc/index.js'
import { isCodecSupported } from '../shared/codecs.js'
import { spawn } from './cross-spawn/index.js'

export class WorkerClient {
  rpc = null

  async run () {
    if (this.rpc !== null) return

    const pipe = await spawn('./node_modules/@holepunchto/keet-worker-compute/worker/index.js') // TODO

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
