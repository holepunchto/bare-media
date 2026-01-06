import { spawn } from 'cross-worker/client'
import ReadyResource from 'ready-resource'

import HRPC from './shared/spec/hrpc/index.js'
import { isCodecSupported, isVideoSupported } from './shared/codecs.js'

export class WorkerClient extends ReadyResource {
  worker = null
  rpc = null
  opts = null

  constructor(opts) {
    super()
    this.initialize(opts)
    this.#attachMethods()
  }

  initialize({ filename = 'node_modules/bare-media/worker/index.js', requireSource, args } = {}) {
    this.opts = { filename, requireSource, args }
  }

  #attachMethods() {
    const methods = ['createImagePreview', 'decodeImage', 'cropImage', 'createVideoPreview']

    for (const method of methods) {
      this[method] = async (...args) => {
        await this.ready()
        return this.rpc[method](...args)
      }
    }

    /** @deprecated Use createImagePreview instead */
    this.createPreview = this.createImagePreview
  }

  async _open() {
    await this.#run()
  }

  async _close() {
    this.worker?.IPC.end()
  }

  #reset() {
    this.opening = null
    this.closing = null

    this.opened = false
    this.closed = false

    this.worker = null
    this.rpc = null
  }

  async #run() {
    const { filename, requireSource, args } = this.opts
    const source = requireSource?.()
    this.worker = await spawn(filename, source, args)

    const ipc = this.worker.IPC

    ipc.on('end', () => ipc.end())
    ipc.on('close', () => {
      this.#reset()
      this.onClose?.()
      console.error('[bare-media] Worker has exited. IPC channel closed unexpectedly.')
    })

    this.rpc = new HRPC(ipc)
  }

  isCodecSupported(mimetype) {
    return isCodecSupported(mimetype)
  }

  isVideoSupported(mimetype) {
    return isVideoSupported(mimetype)
  }
}
