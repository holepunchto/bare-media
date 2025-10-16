import fs from 'bare-fs'
import fetch from 'bare-fetch'
import Corestore from 'corestore'
import BlobServer from 'hypercore-blob-server'
import Hyperblobs from 'hyperblobs'
import tmp from 'test-tmp'

export async function makeHttpLink(t, path, mimetype) {
  console.log('makeHttpLink 0')
  const store = new Corestore(await tmp())

  console.log('makeHttpLink 1')
  const core = store.get({ name: 'test' })
  const blobs = new Hyperblobs(core)
  t.teardown(() => blobs.close())
  console.log('makeHttpLink 2')

  const buffer = fs.readFileSync(path)

  // save file
  const id = await blobs.put(buffer)
  console.log('makeHttpLink 3')

  const server = new BlobServer(store)
  t.teardown(() => server.close())
  await server.listen()
  console.log('makeHttpLink 4')

  // get link
  const httpLink = server.getLink(blobs.core.key, { blob: id })
  const res = await fetch(httpLink)
  t.is(res.status, 200)
  t.alike(await res.buffer(), buffer)
  console.log('makeHttpLink 5')

  return httpLink
}

export function isAnimatedWebP(buffer) {
  if (
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    return false
  }

  let offset = 12
  while (offset < buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4)
    const payloadSize = buffer.readUInt32LE(offset + 4)

    if (chunkId === 'VP8X') {
      const flags = buffer[offset + 8]
      return (flags & 0x02) !== 0
    }

    // 4 + 4 + payload size + even padding
    offset += 8 + payloadSize + (payloadSize % 2)
  }

  return false
}
