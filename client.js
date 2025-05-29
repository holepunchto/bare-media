import RPC from 'bare-rpc'
import { spawn } from './cross-spawn'
import { COMMAND } from './worker/command-code'

export class WorkerClient {
  rpc = null

  async #sendRequest (cmd, data) {
    if (this.rpc === null) {
      await this.run()
    }
    const request = this.rpc.request(cmd)
    request.send(data)
    return request.reply()
  }

  async run () {
    const pipe = await spawn('./node_modules/@holepunchto/keet-worker-compute/worker/index.js') // TODO

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
