import RPC from 'bare-rpc'
import { spawnWorker } from './pear-worker'
import { COMMAND } from './worker/command-code'

export class WorkerClient {
  rpc = null

  async #sendRequest (cmd, data) {
    if (this.rpc === null) {
      await this.spawn()
    }
    const request = this.rpc.request(cmd)
    request.send(data)
    return request.reply()
  }

  async spawn () {
    const pipe = await spawnWorker('./node_modules/@holepunchto/keet-worker-compute/worker/index.js') // TODO

    pipe.on('end', () => pipe.end())
    pipe.on('close', () => {
      this.rpc = null
    })

    function onreq () {}

    this.rpc = new RPC(pipe, onreq)
  }

  heicToJpg (filePath) {
    return this.#sendRequest(COMMAND.HEIC_TO_JPG, filePath)
  }
}
