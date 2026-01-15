import { test } from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'

import { image } from '..'
import { makeHttpLink, isAnimatedWebP } from './helpers'

const { read, decode, encode, crop, resize, slice } = image

test('image read() path', async (t) => {
  const path = './test/fixtures/sample.jpg'

  const buffer = await read(path)

  t.ok(Buffer.isBuffer(buffer))
  t.alike(buffer.slice(0, 2), b4a.from([0xff, 0xd8]), 'jpeg')
})

test('image read() httpLink', async (t) => {
  const path = './test/fixtures/sample.jpg'
  const httpLink = await makeHttpLink(t, path)

  const buffer = await read(httpLink)

  t.ok(Buffer.isBuffer(buffer))
  t.alike(buffer.slice(0, 2), b4a.from([0xff, 0xd8]), 'jpeg')
})

test('image read() buffer', async (t) => {
  const path = './test/fixtures/sample.jpg'
  const buff = fs.readFileSync(path)

  const buffer = await read(buff)

  t.ok(Buffer.isBuffer(buffer))
  t.alike(buffer.slice(0, 2), b4a.from([0xff, 0xd8]), 'jpeg')
})

test('image decode() avif', async (t) => {
  const path = './test/fixtures/sample.avif'

  const buffer = await read(path)
  const rgba = await decode(buffer)

  t.ok(Buffer.isBuffer(rgba.data))
  t.is(rgba.width, 128)
  t.is(rgba.height, 128)
})

test('image decode() bmp', async (t) => {
  const path = './test/fixtures/sample.bmp'

  const buffer = await read(path)
  const rgba = await decode(buffer)
  console.log(rgba)

  t.ok(Buffer.isBuffer(rgba.data))
  t.is(rgba.width, 2)
  t.is(rgba.height, 2)
})

test('image decode() gif', async (t) => {
  const path = './test/fixtures/sample.gif'

  const buffer = await read(path)
  const rgba = await decode(buffer)

  t.ok(Array.isArray(rgba.frames))
  t.is(rgba.frames.length, 44)
  t.is(rgba.width, 400)
  t.is(rgba.height, 400)
})

test('image decode() heic', async (t) => {
  const path = './test/fixtures/sample.heic'

  const buffer = await read(path)
  const rgba = await decode(buffer)

  t.ok(Buffer.isBuffer(rgba.data))
  t.is(rgba.width, 152)
  t.is(rgba.height, 120)
})

test('image decode() jpeg', async (t) => {
  const path = './test/fixtures/sample.jpg'

  const buffer = await read(path)
  const rgba = await decode(buffer)

  t.ok(Buffer.isBuffer(rgba.data))
  t.is(rgba.width, 150)
  t.is(rgba.height, 120)
})

test('image decode() png', async (t) => {
  const path = './test/fixtures/sample.png'

  const buffer = await read(path)
  const rgba = await decode(buffer)

  t.ok(Buffer.isBuffer(rgba.data))
  t.is(rgba.width, 150)
  t.is(rgba.height, 120)
})

test('image decode() tiff', async (t) => {
  const path = './test/fixtures/sample.tiff'

  const buffer = await read(path)
  const rgba = await decode(buffer)

  t.ok(Buffer.isBuffer(rgba.data))
  t.is(rgba.width, 75)
  t.is(rgba.height, 50)
})

test('image decode() webp', async (t) => {
  const path = './test/fixtures/sample.webp'

  const buffer = await read(path)
  const rgba = await decode(buffer)

  t.ok(Array.isArray(rgba.frames))
  t.is(rgba.frames.length, 1)
  t.is(rgba.width, 150)
  t.is(rgba.height, 120)
})

test('image decode() webp (animated)', async (t) => {
  const path = './test/fixtures/animated.webp'

  const buffer = await read(path)
  const rgba = await decode(buffer)

  t.ok(Array.isArray(rgba.frames))
  t.is(rgba.frames.length, 12)
  t.is(rgba.loops, 0)
  t.is(rgba.width, 476)
  t.is(rgba.height, 280)
})

test('image decode() with wrong file extension', async (t) => {
  const path = './test/fixtures/wrong-extension.jpg'

  const buffer = await read(path)
  const rgba = await decode(buffer)

  t.ok(Buffer.isBuffer(rgba.data))
  t.is(rgba.width, 150)
  t.is(rgba.height, 120)
})

test('image decode() gif with maxFrames', async (t) => {
  const path = './test/fixtures/sample.gif'

  const buffer = await read(path)
  const rgba = await decode(buffer, { maxFrames: 3 })

  t.ok(Array.isArray(rgba.frames))
  t.is(rgba.frames.length, 3)
  t.is(rgba.width, 400)
  t.is(rgba.height, 400)
})

test('image decode() webp with maxFrames', async (t) => {
  const path = './test/fixtures/animated.webp'

  const buffer = await read(path)
  const rgba = await decode(buffer, { maxFrames: 3 })

  t.ok(Array.isArray(rgba.frames))
  t.is(rgba.frames.length, 3)
  t.is(rgba.loops, 0)
  t.is(rgba.width, 476)
  t.is(rgba.height, 280)
})

test('image encode() gif throws (not implemented)', async (t) => {
  const path = './test/fixtures/sample.gif'

  const buffer = await read(path)
  const rgba = await decode(buffer)

  await t.exception(async () => {
    try {
      await encode(rgba, 'image/gif')
    } catch (e) {
      throw new Error('Not implemented')
    }
  })
})

test('image encode() heic', async (t) => {
  const path = './test/fixtures/sample.heic'

  const buffer = await read(path)
  const rgba = await decode(buffer)

  await t.exception(async () => {
    try {
      await encode(rgba, 'image/heic')
    } catch (e) {
      throw new Error('Not implemented')
    }
  })
})

test('image encode() jpeg', async (t) => {
  const path = './test/fixtures/sample.jpg'

  const buffer = await read(path)
  const rgba = await decode(buffer)
  const encoded = await encode(rgba, 'image/jpeg')

  t.ok(Buffer.isBuffer(encoded))
})

test('image encode() png', async (t) => {
  const path = './test/fixtures/sample.png'

  const buffer = await read(path)
  const rgba = await decode(buffer)
  const encoded = await encode(rgba, 'image/png')

  t.ok(Buffer.isBuffer(encoded))
})

test('image encode() tiff', async (t) => {
  const path = './test/fixtures/sample.tiff'

  const buffer = await read(path)
  const rgba = await decode(buffer)
  const encoded = await encode(rgba, 'image/tiff')

  t.ok(Buffer.isBuffer(encoded))
})

test('image encode() webp', async (t) => {
  const path = './test/fixtures/sample.webp'

  const buffer = await read(path)
  const rgba = await decode(buffer)
  const encoded = await encode(rgba, 'image/webp')

  t.ok(Buffer.isBuffer(encoded))
})

test('image encode() with maxBytes (reducing quality)', async (t) => {
  const path = './test/fixtures/sample.jpg'

  const buffer = await read(path)
  const rgba = await decode(buffer)
  const encoded = await encode(rgba, 'image/jpeg', { maxBytes: 3000 })

  t.ok(Buffer.isBuffer(encoded))
  t.ok(encoded.byteLength < 3000)
})

test('image encode() with maxBytes (reducing fps)', async (t) => {
  const path = './test/fixtures/animated.webp'

  const buffer = await read(path)
  const rgba = await decode(buffer)
  const encoded = await encode(rgba, 'image/webp', { maxBytes: 40000 })

  t.ok(Buffer.isBuffer(encoded))
  t.ok(encoded.byteLength < 40000)
  t.ok((await decode(encoded)).frames.length < rgba.frames.length)
})

test("image encode() with maxBytes throws if bytes can't fit", async (t) => {
  const path = './test/fixtures/sample.jpg'

  await t.exception(async () => {
    const buffer = await read(path)
    const rgba = await decode(buffer)
    const encoded = await encode(rgba, 'image/jpeg', { maxBytes: 10 })
  })
})

test('image crop()', async (t) => {
  const path = './test/fixtures/sample.jpg'

  const buffer = await read(path)
  const rgba = await decode(buffer)
  const cropped = await crop(rgba, {
    left: 75,
    top: 15,
    width: 50,
    height: 50
  })

  t.is(cropped.data.length, 10000)
  t.is(cropped.width, 50)
  t.is(cropped.height, 50)
})

test('image crop() throws if the rectangle is out of bounds', async (t) => {
  const path = './test/fixtures/sample.jpg'

  const buffer = await read(path)
  const rgba = await decode(buffer)

  await t.exception(async () => {
    await crop(rgba, {
      left: -1,
      top: 15,
      width: 50,
      height: 50
    })
  })
  await t.exception(async () => {
    await crop(rgba, {
      left: 75,
      top: -1,
      width: 50,
      height: 50
    })
  })
  await t.exception(async () => {
    await crop(rgba, {
      left: 75,
      top: 15,
      width: 76,
      height: 50
    })
  })
  await t.exception(async () => {
    await crop(rgba, {
      left: 75,
      top: 15,
      width: 50,
      height: 106
    })
  })
})

test('image resize()', async (t) => {
  const path = './test/fixtures/sample.jpg'

  const buffer = await read(path)
  const rgba = await decode(buffer)
  const resized = await resize(rgba, {
    maxWidth: 50,
    maxHeight: 50
  })

  t.is(resized.data.length, 8000)
  t.is(resized.width, 50)
  t.is(resized.height, 40)
})

test('image slice()', async (t) => {
  const path = './test/fixtures/animated.webp'

  const buffer = await read(path)
  const rgba = await decode(buffer)
  const sliced = await slice(rgba, {
    start: 4,
    end: 8
  })

  t.is(sliced.frames.length, 4)
})

test('image slice() no start', async (t) => {
  const path = './test/fixtures/animated.webp'

  const buffer = await read(path)
  const rgba = await decode(buffer)
  const sliced = await slice(rgba, {
    end: 8
  })

  t.is(sliced.frames.length, 8)
})

test('image slice() no end', async (t) => {
  const path = './test/fixtures/animated.webp'

  const buffer = await read(path)
  const rgba = await decode(buffer)
  const sliced = await slice(rgba, {
    start: 4
  })

  t.is(sliced.frames.length, 8)
})

test('image slice() throws if start > end', async (t) => {
  const path = './test/fixtures/animated.webp'

  const buffer = await read(path)
  const rgba = await decode(buffer)

  await t.exception(async () => {
    const sliced = await slice(rgba, {
      start: 4,
      end: 2
    })
  })
})

test('image pipeline: decode + crop + resize + encode jpeg', async (t) => {
  const path = './test/fixtures/sample.jpg'

  const result = await image(path)
    .decode()
    .crop({ left: 75, top: 15, width: 50, height: 50 })
    .resize({ maxWidth: 32, maxHeight: 32 })
    .encode('image/webp')

  t.ok(Buffer.isBuffer(result))
  t.is(result.byteLength, 442)
})

test('codecs support flags', async (t) => {
  const { isImageSupported, isVideoSupported, isMediaSupported } = await import('../src/codecs.js')

  t.ok(isImageSupported('image/jpeg'))
  t.ok(isImageSupported('image/png'))
  t.absent(isImageSupported('video/mp4'))

  t.ok(isVideoSupported('video/mp4'))
  t.absent(isVideoSupported('image/jpeg'))

  t.ok(isMediaSupported('image/jpeg'))
  t.ok(isMediaSupported('video/mp4'))
  t.absent(isMediaSupported('application/pdf'))
})
