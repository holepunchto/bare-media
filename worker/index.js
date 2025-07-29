import worker from 'cross-worker'
import uncaughts from 'uncaughts'

import HRPC from '../shared/spec/hrpc'

import * as media from './media'
import { log } from './log'

log('Worker started 🚀')

const stream = worker.stream()

stream.on('end', () => stream.end())
stream.on('error', (err) => console.error(err))
stream.on('close', () => Bare.exit(0))

const rpc = new HRPC(stream)

rpc.onCreatePreview(media.createPreview)
rpc.onCreatePreviewAll(media.createPreviewAll)
rpc.onDecodeImage(media.decodeImage)

uncaughts.on((err) => {
  log('Uncaught error:', err)
})
