import HRPCBuilder from 'hrpc'
import Hyperschema from 'hyperschema'

import { schema } from './schema'
import { SCHEMA_DIR, HRPC_DIR } from './constants'

// Schema

Hyperschema.toDisk(schema)

// HRPC

const builder = HRPCBuilder.from(SCHEMA_DIR, HRPC_DIR)
const ns = builder.namespace('media')

ns.register({
  name: 'create-image-preview',
  request: { name: '@media/create-image-preview-request', stream: false },
  response: { name: '@media/create-image-preview-response', stream: false }
})

ns.register({
  name: 'decode-image',
  request: { name: '@media/decode-image-request', stream: false },
  response: { name: '@media/decode-image-response', stream: false }
})

ns.register({
  name: 'crop-image',
  request: { name: '@media/crop-image-request', stream: false },
  response: { name: '@media/crop-image-response', stream: false }
})

ns.register({
  name: 'transcode',
  request: { name: '@media/transcode-request', stream: false },
  response: { name: '@media/transcode-response', stream: true }
})

ns.register({
  name: 'create-video-preview',
  request: { name: '@media/create-video-preview-request', stream: false },
  response: { name: '@media/create-video-preview-response', stream: false }
})

HRPCBuilder.toDisk(builder)
