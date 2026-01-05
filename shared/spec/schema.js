import Hyperschema from 'hyperschema'

import { SCHEMA_DIR } from './constants'

export const schema = Hyperschema.from(SCHEMA_DIR)
const media = schema.namespace('media')

media.register({
  name: 'dimensions',
  fields: [
    {
      name: 'width',
      type: 'uint',
      required: true
    },
    {
      name: 'height',
      type: 'uint',
      required: true
    }
  ]
})

media.register({
  name: 'metadata',
  fields: [
    {
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
    }
  ]
})

media.register({
  name: 'file',
  fields: [
    {
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
    }
  ]
})

media.register({
  name: 'create-preview-request',
  fields: [
    {
      name: 'path',
      type: 'string'
    },
    {
      name: 'httpLink',
      type: 'string'
    },
    {
      name: 'buffer',
      type: 'buffer'
    },
    {
      name: 'mimetype',
      type: 'string'
    },
    {
      name: 'maxWidth',
      type: 'uint'
    },
    {
      name: 'maxHeight',
      type: 'uint'
    },
    {
      name: 'maxFrames',
      type: 'uint'
    },
    {
      name: 'maxBytes',
      type: 'uint'
    },
    {
      name: 'format',
      type: 'string'
    },
    {
      name: 'encoding',
      type: 'string'
    }
  ]
})

media.register({
  name: 'create-preview-response',
  fields: [
    {
      name: 'metadata',
      type: '@media/metadata',
      required: true
    },
    {
      name: 'preview',
      type: '@media/file',
      required: true
    }
  ]
})

media.register({
  name: 'decode-image-request',
  fields: [
    {
      name: 'path',
      type: 'string'
    },
    {
      name: 'httpLink',
      type: 'string'
    },
    {
      name: 'buffer',
      type: 'buffer'
    },
    {
      name: 'mimetype',
      type: 'string'
    }
  ]
})

media.register({
  name: 'decode-image-response',
  fields: [
    {
      name: 'metadata',
      type: '@media/metadata'
    },
    {
      name: 'data',
      type: 'buffer'
    }
  ]
})

media.register({
  name: 'crop-image-request',
  fields: [
    {
      name: 'path',
      type: 'string'
    },
    {
      name: 'httpLink',
      type: 'string'
    },
    {
      name: 'buffer',
      type: 'buffer'
    },
    {
      name: 'mimetype',
      type: 'string'
    },
    {
      name: 'left',
      type: 'uint'
    },
    {
      name: 'top',
      type: 'uint'
    },
    {
      name: 'width',
      type: 'uint'
    },
    {
      name: 'height',
      type: 'uint'
    },
    {
      name: 'format',
      type: 'string'
    }
  ]
})

media.register({
  name: 'crop-image-response',
  fields: [
    {
      name: 'metadata',
      type: '@media/metadata'
    },
    {
      name: 'data',
      type: 'buffer'
    }
  ]
})

media.register({
  name: 'create-video-preview-request',
  fields: [
    {
      name: 'path',
      type: 'string'
    },
    {
      name: 'httpLink',
      type: 'string'
    },
    {
      name: 'buffer',
      type: 'buffer'
    },
    {
      name: 'mimetype',
      type: 'string'
    },
    {
      name: 'maxWidth',
      type: 'uint'
    },
    {
      name: 'maxHeight',
      type: 'uint'
    },
    {
      name: 'maxBytes',
      type: 'uint'
    },
    {
      name: 'timestamp',
      type: 'uint'
    },
    {
      name: 'percent',
      type: 'uint'
    },
    {
      name: 'animated',
      type: 'bool'
    },
    {
      name: 'frameCount',
      type: 'uint'
    },
    {
      name: 'format',
      type: 'string'
    },
    {
      name: 'encoding',
      type: 'string'
    }
  ]
})

media.register({
  name: 'create-video-preview-response',
  fields: [
    {
      name: 'metadata',
      type: '@media/metadata',
      required: true
    },
    {
      name: 'preview',
      type: '@media/file',
      required: true
    }
  ]
})
