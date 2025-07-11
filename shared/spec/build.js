import HRPCBuilder from 'hrpc'
import Hyperschema from 'hyperschema'

import { schema } from './schema'
import { SCHEMA_DIR, HRPC_DIR } from './constants'

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
  name: 'create-preview-all',
  request: { name: '@media/create-preview-all-request', stream: false },
  response: { name: '@media/create-preview-all-response', stream: false }
})

HRPCBuilder.toDisk(builder)
