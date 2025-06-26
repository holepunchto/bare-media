import HRPC from '../shared/spec/hrpc'
import { isCodecSupported } from '../shared/codecs'
import { spawn } from './cross-spawn'

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

  async mediaCreatePreview (arg) {
    await this.run()
    return this.rpc.mediaCreatePreview(arg)
  }
}
