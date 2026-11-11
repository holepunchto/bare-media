import process from 'bare-process'

import { video } from '../..'
import benchmark from '../benchmark'

const filename = process.argv[2]

await benchmark(async () => {
  let bytes = 0

  for await (const chunk of video(filename).transcode({ format: 'mp4' })) {
    bytes += chunk.buffer.byteLength
  }

  return bytes
})
