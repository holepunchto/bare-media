import Hyperschema from 'hyperschema'
import HRPCBuilder from 'hrpc'

const SCHEMA_DIR = './spec/schema'
const HRPC_DIR = './spec/hrpc'

const schema = Hyperschema.from(SCHEMA_DIR)
const media = schema.namespace('media')

media.register({
  name: 'dimensions',
  fields: [{
    name: 'width',
    type: 'uint',
    required: true
  },
  {
    name: 'height',
    type: 'uint',
    required: true
  }]
})

media.register({
  name: 'metadata',
  fields: [{
    name: 'mimetype',
    type: 'string'
  },
  {
    name: 'dimensions',
    type: '@media/dimensions'
  },
  {
    name: 'duration',
    type: 'uint'
  }]
})

media.register({
  name: 'file',
  fields: [{
    name: 'metadata',
    type: '@media/metadata'
  },
  {
    name: 'inlined',
    type: 'string'
  },
  {
    name: 'buffer',
    type: 'buffer'
  }]
})

media.register({
  name: 'preview',
  fields: [{
    name: 'small',
    type: '@media/file'
  },
  {
    name: 'medium',
    type: '@media/file'
  },
  {
    name: 'large',
    type: '@media/file'
  }]
})

media.register({
  name: 'maxSizePreview',
  fields: [{
    name: 'small',
    type: 'uint',
    required: true
  },
  {
    name: 'medium',
    type: 'uint',
    required: true
  },
  {
    name: 'large',
    type: 'uint',
    required: true
  }]
})

media.register({
  name: 'create-preview-request',
  fields: [{
    name: 'path',
    type: 'string',
    required: true
  },
  {
    name: 'maxSize',
    type: '@media/maxSizePreview',
    required: true
  },
  {
    name: 'mimetype',
    type: 'string'
  }]
})

media.register({
  name: 'create-preview-response',
  fields: [{
    name: 'metadata',
    type: '@media/metadata',
    required: true
  },
  {
    name: 'preview',
    type: '@media/preview',
    required: true
  }]
})

Hyperschema.toDisk(schema)

// HRPC

const builder = HRPCBuilder.from(SCHEMA_DIR, HRPC_DIR)
const ns = builder.namespace('media')

ns.register({
  name: 'create-preview',
  request: { name: '@media/create-preview-request', stream: false },
  response: { name: '@media/create-preview-response', stream: false }
})

HRPCBuilder.toDisk(builder)
