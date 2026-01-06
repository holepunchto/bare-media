import worker from 'cross-worker'
import uncaughts from 'uncaughts'

import HRPC from '../shared/spec/hrpc'

import * as media from './media'
import { log } from './util'

log('Worker started 🚀')

const stream = worker.stream()

stream.on('end', () => stream.end())
stream.on('error', (err) => console.error(err))
stream.on('close', () => Bare.exit(0))

const rpc = new HRPC(stream)

rpc.onCreateImagePreview(media.createImagePreview)
rpc.onDecodeImage(media.decodeImage)
rpc.onCropImage(media.cropImage)
rpc.onCreateVideoPreview(media.createVideoPreview)

uncaughts.on((err) => {
  log('Uncaught error:', err)
})
