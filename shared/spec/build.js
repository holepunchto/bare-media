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
  name: 'create-preview',
  request: { name: '@media/create-preview-request', stream: false },
  response: { name: '@media/create-preview-response', stream: false }
})

ns.register({
  name: 'decode-image',
  request: { name: '@media/decode-image-request', stream: false },
  response: { name: '@media/decode-image-response', stream: false }
})

HRPCBuilder.toDisk(builder)
